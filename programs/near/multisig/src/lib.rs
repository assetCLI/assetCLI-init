use std::collections::HashSet;

use near_sdk::{
    env,
    json_types::{ Base64VecU8, U128, U64 },
    near,
    store::{ IterableMap, IterableSet, LookupMap },
    AccountId,
    Gas,
    NearToken,
    Promise,
    PromiseOrValue,
    PublicKey,
};
use near_sdk::{ BorshStorageKey, serde_json };

/// Request cooldown period (time before a request can be deleted)
const REQUEST_COOLDOWN: u64 = 900_000_000_000;

/// Default limit of active requests.
const ACTIVE_REQUESTS_LIMIT: u32 = 12;

/// Default set of methods that access key should have.
const MULTISIG_METHOD_NAMES: &str = "add_request,delete_request,confirm,add_and_confirm_request";

pub type RequestId = u32;

#[near(serializers = [json, borsh])]
pub struct FunctionCallPermission {
    allowance: Option<U128>,
    receiver_id: AccountId,
    method_names: Vec<String>,
}

#[near(serializers = [json, borsh])]
pub enum MultiSigRequestAction {
    /// Transfers given amount to receiver.
    Transfer {
        amount: U128,
    },
    /// Create a new account.
    CreateAccount,
    /// Deploys contract to receiver's account. Can upgrade given contract as well.
    DeployContract {
        code: Base64VecU8,
    },
    /// Add new member of the multisig.
    AddMember {
        member: MultisigMember,
    },
    /// Remove existing member of the multisig.
    DeleteMember {
        member: MultisigMember,
    },
    /// Adds full access key to another account.
    AddKey {
        public_key: PublicKey,
        #[serde(skip_serializing_if = "Option::is_none")]
        permission: Option<FunctionCallPermission>,
    },
    /// Call function on behalf of this contract.
    FunctionCall {
        method_name: String,
        args: Base64VecU8,
        deposit: U128,
        gas: U64,
    },
    /// Sets number of confirmations required to authorize requests.
    /// Can not be bundled with any other actions or transactions.
    SetNumConfirmations {
        num_confirmations: u32,
    },
    /// Sets number of active requests (unconfirmed requests) per access key
    /// Default is 12 unconfirmed requests at a time
    /// The REQUEST_COOLDOWN for requests is 15min
    /// Worst gas attack a malicious keyholder could do is 12 requests every 15min
    SetActiveRequestsLimit {
        active_requests_limit: u32,
    },
}

#[near(serializers = [json, borsh])]
pub struct MultiSigRequest {
    receiver_id: AccountId,
    actions: Vec<MultiSigRequestAction>,
}

#[near(serializers = [json, borsh])]
pub struct MultiSigRequestWithSigner {
    request: MultiSigRequest,
    member: MultisigMember,
    added_timestamp: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Ord, Clone, PartialEq, PartialOrd, Eq)]
pub enum MultisigMember {
    AccessKey {
        public_key: PublicKey,
    },
    Account {
        account_id: AccountId,
    },
}

impl ToString for MultisigMember {
    fn to_string(&self) -> String {
        serde_json::to_string(&self).unwrap_or_else(|_| env::panic_str("Failed to serialize"))
    }
}

#[near(serializers = [json, borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKeys {
    Members,
    Requests,
    Confirmations,
    NumRequestsPk,
}

#[near(contract_state)]
pub struct MultiSigContract {
    /// Members of the multisig.
    members: IterableSet<MultisigMember>,
    /// Number of confirmations required.
    num_confirmations: u32,
    /// Latest request nonce.
    request_nonce: RequestId,
    /// All active requests.
    requests: IterableMap<RequestId, MultiSigRequestWithSigner>,
    /// All confirmations for active requests.
    confirmations: LookupMap<RequestId, HashSet<String>>,
    /// Number of requests per member.
    num_requests_pk: LookupMap<String, u32>,
    /// Limit number of active requests per member.
    active_requests_limit: u32,
}

#[inline]
fn assert(condition: bool, error: &str) {
    if !condition {
        env::panic_str(error);
    }
}

impl Default for MultiSigContract {
    fn default() -> Self {
        Self {
            members: IterableSet::new(StorageKeys::Members),
            num_confirmations: 0,
            request_nonce: 0,
            requests: IterableMap::new(StorageKeys::Requests),
            confirmations: LookupMap::new(StorageKeys::Confirmations),
            num_requests_pk: LookupMap::new(StorageKeys::NumRequestsPk),
            active_requests_limit: ACTIVE_REQUESTS_LIMIT,
        }
    }
}

// Implement the contract structure
#[near]
impl MultiSigContract {
    /// Initialize multisig contract.
    /// @params members: list of {"account_id": "name"} or {"public_key": "key"} members.
    /// @params num_confirmations: k of n signatures required to perform operations.
    #[init]
    pub fn new(members: Vec<MultisigMember>, num_confirmations: u32) -> Self {
        assert(
            members.len() >= (num_confirmations as usize),
            "Members list must be equal or larger than number of confirmations"
        );
        let mut multisig = Self::default();
        let mut promise = Promise::new(env::current_account_id());
        for member in members {
            promise = multisig.add_member(promise, member);
        }
        multisig
    }

    pub fn add_request(&mut self, request: MultiSigRequest) -> RequestId {
        let current_member = self
            .current_member()
            .unwrap_or_else(|| {
                env::panic_str(
                    "Predecessor must be a member or transaction signed with key of given account"
                )
            });
        // track how many requests this key has made
        let num_requests = self.num_requests_pk.get(&current_member.to_string()).unwrap_or(&0) + 1;
        assert(
            num_requests <= self.active_requests_limit,
            "Account has too many active requests. Confirm or delete some."
        );
        self.num_requests_pk.insert(current_member.to_string(), num_requests);
        // add the request
        let request_added = MultiSigRequestWithSigner {
            member: current_member,
            added_timestamp: env::block_timestamp(),
            request,
        };
        self.requests.insert(self.request_nonce, request_added);
        let confirmations = HashSet::new();
        self.confirmations.insert(self.request_nonce, confirmations);
        self.request_nonce += 1;
        self.request_nonce - 1
    }

    /// Add request for multisig and confirm with the pk that added.
    pub fn add_request_and_confirm(&mut self, request: MultiSigRequest) -> RequestId {
        let request_id = self.add_request(request);
        self.confirm(request_id);
        request_id
    }

    /// Remove given request and associated confirmations.
    pub fn delete_request(&mut self, request_id: RequestId) {
        self.assert_valid_request(request_id);
        let request_with_signer = self.requests
            .get(&request_id)
            .unwrap_or_else(|| env::panic_str("No such request"));
        // can't delete requests before 15min
        assert(
            env::block_timestamp() > request_with_signer.added_timestamp + REQUEST_COOLDOWN,
            "Request cannot be deleted immediately after creation."
        );
        self.remove_request(request_id);
    }

    fn execute_request(&mut self, request: MultiSigRequest) -> PromiseOrValue<bool> {
        let mut promise = Promise::new(request.receiver_id.clone());
        let receiver_id = request.receiver_id.clone();
        let num_actions = request.actions.len();
        for action in request.actions {
            promise = match action {
                MultiSigRequestAction::Transfer { amount } =>
                    promise.transfer(NearToken::from_near(amount.0)),
                MultiSigRequestAction::CreateAccount => promise.create_account(),
                MultiSigRequestAction::DeployContract { code } => {
                    promise.deploy_contract(code.into())
                }
                MultiSigRequestAction::AddMember { member } => {
                    self.assert_self_request(receiver_id.clone());
                    self.add_member(promise, member)
                }
                MultiSigRequestAction::DeleteMember { member } => {
                    self.assert_self_request(receiver_id.clone());
                    self.delete_member(promise, member)
                }
                MultiSigRequestAction::AddKey { public_key, permission } => {
                    self.assert_self_request(receiver_id.clone());
                    if let Some(permission) = permission {
                        promise.add_access_key_allowance(
                            public_key.into(),
                            near_sdk::Allowance::Unlimited,
                            permission.receiver_id,
                            permission.method_names.join(",")
                        )
                    } else {
                        // wallet UI should warn user if receiver_id == env::current_account_id(), adding FAK will render multisig useless
                        promise.add_full_access_key(public_key.into())
                    }
                }
                MultiSigRequestAction::FunctionCall { method_name, args, deposit, gas } =>
                    promise.function_call(
                        method_name,
                        args.into(),
                        NearToken::from_near(deposit.0),
                        Gas::from_tgas(gas.0)
                    ),
                // the following methods must be a single action
                MultiSigRequestAction::SetNumConfirmations { num_confirmations } => {
                    self.assert_one_action_only(receiver_id, num_actions);
                    self.num_confirmations = num_confirmations;
                    return PromiseOrValue::Value(true);
                }
                MultiSigRequestAction::SetActiveRequestsLimit { active_requests_limit } => {
                    self.assert_one_action_only(receiver_id, num_actions);
                    self.active_requests_limit = active_requests_limit;
                    return PromiseOrValue::Value(true);
                }
            };
        }
        promise.into()
    }

    /// Confirm given request with given signing key.
    /// If with this, there has been enough confirmation, a promise with request will be scheduled.
    pub fn confirm(&mut self, request_id: RequestId) -> PromiseOrValue<bool> {
        self.assert_valid_request(request_id);
        let member = self
            .current_member()
            .unwrap_or_else(|| env::panic_str("Must be validated above"));
        let mut confirmations = self.confirmations.get(&request_id).unwrap().clone();
        assert(
            !confirmations.contains(&member.to_string()),
            "Already confirmed this request with this key"
        );
        if (confirmations.len() as u32) + 1 >= self.num_confirmations {
            let request = self.remove_request(request_id);
            /********************************
            NOTE: If the tx execution fails for any reason, the request and confirmations are removed already, so the client has to start all over
            ********************************/
            self.execute_request(request)
        } else {
            confirmations.insert(member.to_string());
            self.confirmations.insert(request_id, confirmations);
            PromiseOrValue::Value(true)
        }
    }

    /********************************
    Helper methods
    ********************************/

    /// Returns current member: either predecessor as account or if it's the same as current account - signer.
    fn current_member(&self) -> Option<MultisigMember> {
        let member = if env::current_account_id() == env::predecessor_account_id() {
            MultisigMember::AccessKey {
                public_key: env
                    ::signer_account_pk()
                    .try_into()
                    .unwrap_or_else(|_| env::panic_str("Failed to deserialize public key")),
            }
        } else {
            MultisigMember::Account {
                account_id: env::predecessor_account_id(),
            }
        };
        if self.members.contains(&member) {
            Some(member)
        } else {
            None
        }
    }

    /// Add member to the list. Adds access key if member is key based.
    fn add_member(&mut self, promise: Promise, member: MultisigMember) -> Promise {
        self.members.insert(member.clone().into());
        match member {
            MultisigMember::AccessKey { public_key } =>
                promise.add_access_key_allowance(
                    public_key.into(),
                    near_sdk::Allowance::Unlimited,
                    env::current_account_id(),
                    MULTISIG_METHOD_NAMES.to_string()
                ),
            MultisigMember::Account { account_id: _ } => promise,
        }
    }

    /// Delete member from the list. Removes access key if the member is key based.
    fn delete_member(&mut self, promise: Promise, member: MultisigMember) -> Promise {
        assert(
            self.members.len() - 1 >= (self.num_confirmations as u32),
            "Removing given member will make total number of members below number of confirmations"
        );
        // delete outstanding requests by public_key
        let request_ids: Vec<u32> = self.requests
            .iter()
            .filter_map(|(k, r)| if r.member == member { Some(*k) } else { None })
            .collect();
        for request_id in request_ids {
            // remove confirmations for this request
            self.confirmations.remove(&request_id);
            self.requests.remove(&request_id);
        }
        // remove num_requests_pk entry for member
        self.num_requests_pk.remove(&member.to_string());
        self.members.remove(&member);
        match member {
            MultisigMember::AccessKey { public_key } => promise.delete_key(public_key.into()),
            MultisigMember::Account { account_id: _ } => promise,
        }
    }

    /// Removes request, removes confirmations and reduces num_requests_pk - used in delete, delete_key, and confirm
    fn remove_request(&mut self, request_id: RequestId) -> MultiSigRequest {
        // remove confirmations for this request
        self.confirmations.remove(&request_id);
        // remove the original request
        let request_with_signer = self.requests
            .remove(&request_id)
            .unwrap_or_else(|| env::panic_str("Failed to remove existing element"));
        // decrement num_requests for original request signer
        let original_member = request_with_signer.member;
        let mut num_requests = self.num_requests_pk
            .get(&original_member.to_string())
            .unwrap_or(&0)
            .clone();
        // safety check for underrun (unlikely since original_signer_pk must have num_requests_pk > 0)
        if num_requests > 0 {
            num_requests -= 1;
        }
        self.num_requests_pk.insert(original_member.to_string(), num_requests);
        // return request
        request_with_signer.request
    }

    /// Prevents access to calling requests and make sure request_id is valid - used in delete and confirm
    fn assert_valid_request(&mut self, request_id: RequestId) {
        // request must come from key added to contract account
        assert(
            self.current_member().is_some(),
            "Caller (predecessor or signer) is not a member of this multisig"
        );
        // request must exist
        assert(
            self.requests.get(&request_id).is_some(),
            "No such request: either wrong number or already confirmed"
        );
        // request must have
        assert(
            self.confirmations.get(&request_id).is_some(),
            "Internal error: confirmations mismatch requests"
        );
    }

    /// Prevents request from approving tx on another account
    fn assert_self_request(&mut self, receiver_id: AccountId) {
        assert(
            receiver_id == env::current_account_id(),
            "This method only works when receiver_id is equal to current_account_id"
        );
    }

    /// Prevents a request from being bundled with other actions
    fn assert_one_action_only(&mut self, receiver_id: AccountId, num_actions: usize) {
        self.assert_self_request(receiver_id);
        assert(num_actions == 1, "This method should be a separate request");
    }
}
