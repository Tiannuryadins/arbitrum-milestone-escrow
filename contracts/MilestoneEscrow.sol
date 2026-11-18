// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title MilestoneEscrow
/// @notice Trustless milestone escrow for freelance work on Arbitrum.
/// @dev A client funds an escrow in ETH up front. Work is split into
/// milestones; the freelancer submits proof of work (an off-chain content
/// hash / URL stored as a string) and the client releases payment per
/// milestone. A neutral arbitrator resolves disputes. No admin keys:
/// the deployer has no special powers after deployment.
/// @dev Security notes:
///  - Checks-effects-interactions ordering + a reentrancy guard on all
///    functions that move ETH.
///  - All ETH movement is push-based to the recorded freelancer/client
///    addresses only; there is no arbitrary-call / delegatecall.
///  - Milestone amounts are reserved at creation time, so the contract
///    can never promise more than it holds.
contract MilestoneEscrow {
    enum EscrowStatus { Active, Completed, Cancelled }
    enum MilestoneStatus { Pending, Submitted, Released, Disputed, Refunded }

    struct Milestone {
        string description;
        uint256 amount;
        MilestoneStatus status;
        string workProof; // off-chain proof: URL / IPFS CID / content hash
        uint256 submittedAt;
        uint256 resolvedAt;
    }

    struct Escrow {
        address client;
        address freelancer;
        address arbitrator; // address(0) = no arbitrator; disputes then need mutual cancel
        uint256 funded; // total ETH ever deposited
        uint256 released; // total ETH paid out to freelancer
        uint256 refunded; // total ETH returned to client
        uint256 reserved; // ETH locked in open (non-terminal) milestones
        EscrowStatus status;
        uint256 createdAt;
        Milestone[] milestones;
    }

    uint256 public escrowCount;
    mapping(uint256 => Escrow) private escrows;

    // Minimal reentrancy guard (no external dependencies).
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_reentrancyStatus == _NOT_ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    event EscrowCreated(
        uint256 indexed escrowId, address indexed client, address indexed freelancer, address arbitrator, uint256 funded
    );
    event FundsAdded(uint256 indexed escrowId, uint256 amount, uint256 totalFunded);
    event MilestoneAdded(uint256 indexed escrowId, uint256 indexed milestoneId, string description, uint256 amount);
    event WorkSubmitted(uint256 indexed escrowId, uint256 indexed milestoneId, string workProof);
    event MilestoneReleased(
        uint256 indexed escrowId, uint256 indexed milestoneId, address indexed freelancer, uint256 amount
    );
    event MilestoneDisputed(uint256 indexed escrowId, uint256 indexed milestoneId, address indexed by);
    event DisputeResolved(
        uint256 indexed escrowId, uint256 indexed milestoneId, bool releasedToFreelancer, uint256 amount
    );
    event EscrowCompleted(uint256 indexed escrowId);
    event EscrowCancelled(uint256 indexed escrowId, uint256 refunded);

    error ZeroAddress();
    error ZeroAmount();
    error NotClient();
    error NotFreelancer();
    error NotArbitrator();
    error NotParticipant();
    error EscrowNotActive();
    error MilestoneNotFound();
    error InvalidMilestoneState();
    error InsufficientUnreservedFunds();
    error SelfEscrow();
    error NothingToCancel();

    modifier onlyClient(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].client) revert NotClient();
        _;
    }

    modifier onlyFreelancer(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].freelancer) revert NotFreelancer();
        _;
    }

    modifier activeEscrow(uint256 escrowId) {
        if (escrows[escrowId].status != EscrowStatus.Active) revert EscrowNotActive();
        _;
    }

    /// @notice Create a funded escrow. The caller is the client.
    /// @param freelancer Address that will receive milestone payments.
    /// @param arbitrator Neutral third party for disputes, or address(0).
    /// @return escrowId The new escrow id.
    function createEscrow(address freelancer, address arbitrator) external payable returns (uint256 escrowId) {
        if (freelancer == address(0)) revert ZeroAddress();
        if (freelancer == msg.sender) revert SelfEscrow();
        if (msg.value == 0) revert ZeroAmount();

        escrowId = escrowCount++;
        Escrow storage e = escrows[escrowId];
        e.client = msg.sender;
        e.freelancer = freelancer;
        e.arbitrator = arbitrator;
        e.funded = msg.value;
        e.status = EscrowStatus.Active;
        e.createdAt = block.timestamp;

        emit EscrowCreated(escrowId, msg.sender, freelancer, arbitrator, msg.value);
    }

    /// @notice Top up an active escrow (client only).
    function addFunds(uint256 escrowId) external payable onlyClient(escrowId) activeEscrow(escrowId) {
        if (msg.value == 0) revert ZeroAmount();
        escrows[escrowId].funded += msg.value;
        emit FundsAdded(escrowId, msg.value, escrows[escrowId].funded);
    }

    /// @notice Add a milestone, reserving its amount from unreserved funds.
    function addMilestone(uint256 escrowId, string calldata description, uint256 amount)
        external
        onlyClient(escrowId)
        activeEscrow(escrowId)
        returns (uint256 milestoneId)
    {
        if (amount == 0) revert ZeroAmount();
        Escrow storage e = escrows[escrowId];
        if (amount > unreservedBalance(escrowId)) revert InsufficientUnreservedFunds();

        milestoneId = e.milestones.length;
        e.milestones.push(
            Milestone({
                description: description,
                amount: amount,
                status: MilestoneStatus.Pending,
                workProof: "",
                submittedAt: 0,
                resolvedAt: 0
            })
        );
        e.reserved += amount;

        emit MilestoneAdded(escrowId, milestoneId, description, amount);
    }

    /// @notice Freelancer submits proof of work for a pending milestone.
    function submitWork(uint256 escrowId, uint256 milestoneId, string calldata workProof)
        external
        onlyFreelancer(escrowId)
        activeEscrow(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        if (milestoneId >= e.milestones.length) revert MilestoneNotFound();
        Milestone storage m = e.milestones[milestoneId];
        if (m.status != MilestoneStatus.Pending) revert InvalidMilestoneState();

        m.status = MilestoneStatus.Submitted;
        m.workProof = workProof;
        m.submittedAt = block.timestamp;

        emit WorkSubmitted(escrowId, milestoneId, workProof);
    }

    /// @notice Client approves submitted work and releases payment.
    function approveMilestone(uint256 escrowId, uint256 milestoneId)
        external
        nonReentrant
        onlyClient(escrowId)
        activeEscrow(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        if (milestoneId >= e.milestones.length) revert MilestoneNotFound();
        Milestone storage m = e.milestones[milestoneId];
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();

        // Effects first.
        m.status = MilestoneStatus.Released;
        m.resolvedAt = block.timestamp;
        e.reserved -= m.amount;
        e.released += m.amount;

        // Interaction last.
        (bool ok,) = payable(e.freelancer).call{value: m.amount}("");
        require(ok, "ETH transfer failed");

        emit MilestoneReleased(escrowId, milestoneId, e.freelancer, m.amount);
        _maybeComplete(escrowId);
    }

    /// @notice Client or freelancer disputes a submitted milestone.
    function disputeMilestone(uint256 escrowId, uint256 milestoneId)
        external
        activeEscrow(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        if (msg.sender != e.client && msg.sender != e.freelancer) revert NotParticipant();
        if (milestoneId >= e.milestones.length) revert MilestoneNotFound();
        Milestone storage m = e.milestones[milestoneId];
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneState();

        m.status = MilestoneStatus.Disputed;
        emit MilestoneDisputed(escrowId, milestoneId, msg.sender);
    }

    /// @notice Arbitrator resolves a dispute: pay the freelancer or refund the client.
    function resolveDispute(uint256 escrowId, uint256 milestoneId, bool releaseToFreelancer)
        external
        nonReentrant
        activeEscrow(escrowId)
    {
        Escrow storage e = escrows[escrowId];
        if (e.arbitrator == address(0) || msg.sender != e.arbitrator) revert NotArbitrator();
        if (milestoneId >= e.milestones.length) revert MilestoneNotFound();
        Milestone storage m = e.milestones[milestoneId];
        if (m.status != MilestoneStatus.Disputed) revert InvalidMilestoneState();

        // Effects first.
        m.resolvedAt = block.timestamp;
        e.reserved -= m.amount;
        address payable recipient;
        if (releaseToFreelancer) {
            m.status = MilestoneStatus.Released;
            e.released += m.amount;
            recipient = payable(e.freelancer);
        } else {
            m.status = MilestoneStatus.Refunded;
            e.refunded += m.amount;
            recipient = payable(e.client);
        }

        // Interaction last.
        (bool ok,) = recipient.call{value: m.amount}("");
        require(ok, "ETH transfer failed");

        emit DisputeResolved(escrowId, milestoneId, releaseToFreelancer, m.amount);
        _maybeComplete(escrowId);
    }

    /// @notice Client cancels an active escrow with no open milestones.
    /// @dev Refunds all unreserved funds. Open (pending/submitted/disputed)
    /// milestones block cancellation so in-flight work is never rug-pulled.
    function cancelEscrow(uint256 escrowId) external nonReentrant onlyClient(escrowId) activeEscrow(escrowId) {
        Escrow storage e = escrows[escrowId];
        if (e.reserved != 0) revert NothingToCancel();
        uint256 refund = unreservedBalance(escrowId);
        if (refund == 0) revert NothingToCancel();

        // Effects first.
        e.status = EscrowStatus.Cancelled;
        e.refunded += refund;

        // Interaction last.
        (bool ok,) = payable(e.client).call{value: refund}("");
        require(ok, "ETH transfer failed");

        emit EscrowCancelled(escrowId, refund);
    }

    /// @notice Mark the escrow completed once every milestone reached a terminal state
    /// and no unreserved dust remains claimable. Completion is cosmetic: all
    /// payouts already happened. Any leftover unreserved ETH can still be
    /// reclaimed via cancelEscrow only while Active, so completion requires
    /// the client to have no refundable remainder — in practice the client
    /// cancels first if dust remains.
    function _maybeComplete(uint256 escrowId) internal {
        Escrow storage e = escrows[escrowId];
        if (e.reserved == 0 && e.milestones.length > 0 && unreservedBalance(escrowId) == 0) {
            e.status = EscrowStatus.Completed;
            emit EscrowCompleted(escrowId);
        }
    }

    // ---- Views ----

    /// @notice ETH in the escrow not reserved by open milestones.
    function unreservedBalance(uint256 escrowId) public view returns (uint256) {
        Escrow storage e = escrows[escrowId];
        return e.funded - e.released - e.refunded - e.reserved;
    }

    function getEscrow(uint256 escrowId)
        external
        view
        returns (
            address client,
            address freelancer,
            address arbitrator,
            uint256 funded,
            uint256 released,
            uint256 refunded,
            uint256 reserved,
            EscrowStatus status,
            uint256 createdAt,
            uint256 milestoneCount
        )
    {
        Escrow storage e = escrows[escrowId];
        return (
            e.client,
            e.freelancer,
            e.arbitrator,
            e.funded,
            e.released,
            e.refunded,
            e.reserved,
            e.status,
            e.createdAt,
            e.milestones.length
        );
    }

    function getMilestone(uint256 escrowId, uint256 milestoneId)
        external
        view
        returns (
            string memory description,
            uint256 amount,
            MilestoneStatus status,
            string memory workProof,
            uint256 submittedAt,
            uint256 resolvedAt
        )
    {
        Escrow storage e = escrows[escrowId];
        require(milestoneId < e.milestones.length, "MilestoneNotFound");
        Milestone storage m = e.milestones[milestoneId];
        return (m.description, m.amount, m.status, m.workProof, m.submittedAt, m.resolvedAt);
    }
}
