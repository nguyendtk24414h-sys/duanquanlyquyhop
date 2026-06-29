// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Giao diện tối thiểu của vVNDToken để Multisig gọi burn trực tiếp.
interface IVVNDToken {
    function burn(address from, uint256 amount) external;
}

/// @title ClassFundMultiSig
/// @notice Ví đa chữ ký quản trị quỹ lớp theo mô hình DAO 2/3.
/// @dev Hợp đồng này chỉ quản lý đề xuất chi quỹ, duyệt đề xuất và kích hoạt burn vVND on-chain.
///      Việc chuyển tiền ngân hàng thực tế vẫn do backend/off-chain thực hiện.
contract ClassFundMultiSig {
    uint256 public constant MIN_APPROVALS = 2;

    /// @notice Tổng số proposal đã tạo.
    uint256 public proposalCount;

    /// @notice Hợp đồng token vVND dùng để burn khi chi quỹ.
    IVVNDToken public vVNDToken;

    /// @notice Danh sách 3 ví đại diện (Thủ quỹ, Trưởng ban phụ huynh, GVCN).
    address[3] public signers;

    /// @notice Kiểm tra nhanh một địa chỉ có nằm trong 3 signer hay không.
    mapping(address => bool) public isSigner;

    /// @notice Dữ liệu từng proposal.
    struct Proposal {
        address proposer;
        address recipient;
        address burnFrom;
        uint256 amount;
        uint8 approvalCount;
        bool executed;
        string reason;
    }

    /// @notice Lưu proposal theo id.
    mapping(uint256 => Proposal) private _proposals;

    /// @notice Trạng thái đã duyệt của từng signer cho từng proposal.
    mapping(uint256 => mapping(address => bool)) private _approvedBy;

    // =========================
    // Custom Errors
    // =========================
    error ZeroAddress();
    error InvalidSignerSet();
    error NotSigner(address caller);
    error ProposalNotFound(uint256 proposalId);
    error AlreadyApproved(uint256 proposalId, address approver);
    error ProposalAlreadyExecuted(uint256 proposalId);
    error ProposalNotApproved(uint256 proposalId);
    error InvalidAmount();
    error EmptyReason();

    // =========================
    // Events
    // =========================

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed recipient,
        address burnFrom,
        uint256 amount,
        string reason
    );

    event ProposalApproved(
        uint256 indexed proposalId,
        address indexed approver,
        uint256 approvalCount
    );

    event FundsBurned(
        uint256 indexed proposalId,
        address indexed burnFrom,
        uint256 amount
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        address indexed executor,
        address indexed recipient,
        address burnFrom,
        uint256 amount,
        string reason
    );

    modifier onlySigner() {
        if (!isSigner[msg.sender]) revert NotSigner(msg.sender);
        _;
    }

    constructor(
        address tokenAddress,
        address signer1,
        address signer2,
        address signer3
    ) {
        if (
            tokenAddress == address(0) ||
            signer1 == address(0) ||
            signer2 == address(0) ||
            signer3 == address(0)
        ) revert ZeroAddress();

        if (
            signer1 == signer2 ||
            signer1 == signer3 ||
            signer2 == signer3
        ) revert InvalidSignerSet();

        vVNDToken = IVVNDToken(tokenAddress);

        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;

        isSigner[signer1] = true;
        isSigner[signer2] = true;
        isSigner[signer3] = true;
    }

    /// @notice Tạo đề xuất chi quỹ.
    function createProposal(
        uint256 amount,
        address recipient,
        string calldata reason,
        address burnFrom
    ) external onlySigner returns (uint256 proposalId) {
        if (amount == 0) revert InvalidAmount();
        if (recipient == address(0) || burnFrom == address(0)) revert ZeroAddress();
        if (bytes(reason).length == 0) revert EmptyReason();

        unchecked {
            proposalCount++;
        }

        proposalId = proposalCount;

        Proposal storage p = _proposals[proposalId];

        p.proposer = msg.sender;
        p.recipient = recipient;
        p.burnFrom = burnFrom;
        p.amount = amount;
        p.reason = reason;

        emit ProposalCreated(
            proposalId,
            msg.sender,
            recipient,
            burnFrom,
            amount,
            reason
        );
    }

    /// @notice Duyệt proposal bằng MetaMask.
    function approveProposal(uint256 proposalId) external onlySigner {
        Proposal storage p = _getProposal(proposalId);

        if (p.executed) revert ProposalAlreadyExecuted(proposalId);

        if (_approvedBy[proposalId][msg.sender]) {
            revert AlreadyApproved(proposalId, msg.sender);
        }

        _approvedBy[proposalId][msg.sender] = true;

        unchecked {
            p.approvalCount++;
        }

        emit ProposalApproved(
            proposalId,
            msg.sender,
            p.approvalCount
        );
    }

    /// @notice Thực thi proposal khi đạt >= 2 chữ ký.
    function executeProposal(uint256 proposalId) external onlySigner {
        Proposal storage p = _getProposal(proposalId);

        if (p.executed) revert ProposalAlreadyExecuted(proposalId);

        if (p.approvalCount < MIN_APPROVALS) {
            revert ProposalNotApproved(proposalId);
        }

        p.executed = true;

        // Burn token để ghi nhận chi quỹ minh bạch on-chain
        vVNDToken.burn(p.burnFrom, p.amount);

        emit FundsBurned(
            proposalId,
            p.burnFrom,
            p.amount
        );

        emit ProposalExecuted(
            proposalId,
            msg.sender,
            p.recipient,
            p.burnFrom,
            p.amount,
            p.reason
        );
    }

    /// @notice Xem chi tiết proposal.
    function getProposal(uint256 proposalId)
        external
        view
        returns (
            address proposer,
            address recipient,
            address burnFrom,
            uint256 amount,
            string memory reason,
            uint8 approvalCount,
            bool executed
        )
    {
        Proposal storage p = _getProposal(proposalId);

        return (
            p.proposer,
            p.recipient,
            p.burnFrom,
            p.amount,
            p.reason,
            p.approvalCount,
            p.executed
        );
    }

    /// @notice Kiểm tra signer đã approve chưa.
    function hasApproved(
        uint256 proposalId,
        address signer
    ) external view returns (bool) {
        return _approvedBy[proposalId][signer];
    }

    /// @notice Trả về danh sách 3 signer.
    function getSigners() external view returns (address[3] memory) {
        return signers;
    }

    /// @dev Kiểm tra proposal tồn tại.
    function _getProposal(
        uint256 proposalId
    ) internal view returns (Proposal storage p) {
        if (
            proposalId == 0 ||
            proposalId > proposalCount
        ) {
            revert ProposalNotFound(proposalId);
        }

        p = _proposals[proposalId];

        if (p.proposer == address(0)) {
            revert ProposalNotFound(proposalId);
        }
    }
}
