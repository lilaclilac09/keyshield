# Makefile for KeyShield Solana program deployment

PROGRAM_NAME := keyshield
PROGRAM_SO := target/deploy/$(PROGRAM_NAME).so
PROGRAM_KEYPAIR := target/deploy/$(PROGRAM_NAME)-keypair.json
KEYPAIR := $(HOME)/.config/solana/id.json

# Default cluster
CLUSTER ?= devnet

# RPC URLs — if HELIUS_API_KEY is set, devnet uses Helius (faster/fewer RPC issues)
ifdef HELIUS_API_KEY
RPC_DEVNET := https://devnet.helius-rpc.com/?api-key=$(HELIUS_API_KEY)
else
RPC_DEVNET := https://api.devnet.solana.com
endif
# Alternative devnet RPCs (if public devnet fails): set HELIUS_API_KEY or uncomment:
# RPC_DEVNET := https://rpc.ankr.com/solana_devnet
RPC_MAINNET := https://api.mainnet-beta.solana.com

# Select RPC
ifeq ($(CLUSTER),devnet)
    RPC_URL := $(RPC_DEVNET)
else ifeq ($(CLUSTER),mainnet)
    RPC_URL := $(RPC_MAINNET)
else
    $(error Unsupported CLUSTER: $(CLUSTER). Use devnet or mainnet)
endif

# Colors
GREEN := \033[0;32m
CYAN := \033[0;36m
NC := \033[0m
LOG_PATH := /Users/aileen/Downloads/privacy_hack/keyshield/.cursor/debug.log

.PHONY: build deploy deploy-and-test clean

build:
	@echo "Building Rust program for Solana..."
	cargo build-sbf
	@echo "Build complete: $(PROGRAM_SO)"

deploy: build
	@echo "Deploying to $(CLUSTER)..."
	# #region agent log
	@printf '{"sessionId":"debug-session","runId":"pre","hypothesisId":"H1","location":"Makefile:deploy.start","message":"deploy start","data":{"cluster":"$(CLUSTER)","rpcUrl":"$(RPC_URL)"},"timestamp":%s}\n' "$$(date +%s000)" >> $(LOG_PATH)
	# #endregion agent log
	@solana config set --url $(RPC_URL)
	# #region agent log
	@RPC_OK=true; solana cluster-version --url $(RPC_URL) >/dev/null 2>&1 || RPC_OK=false; \
	printf '{"sessionId":"debug-session","runId":"pre","hypothesisId":"H1","location":"Makefile:deploy.rpc_check","message":"rpc check","data":{"rpcOk":'$$RPC_OK',"rpcUrl":"$(RPC_URL)"},"timestamp":%s}\n' "$$(date +%s000)" >> $(LOG_PATH)
	# #endregion agent log
	# #region agent log
	@KEYPAIR_EXISTS=false; PROGRAM_ID=""; \
	if [ -f "$(PROGRAM_KEYPAIR)" ]; then KEYPAIR_EXISTS=true; PROGRAM_ID=$$(solana address -k $(PROGRAM_KEYPAIR) 2>/dev/null); fi; \
	printf '{"sessionId":"debug-session","runId":"pre","hypothesisId":"H2","location":"Makefile:deploy.keypair","message":"program keypair status","data":{"path":"$(PROGRAM_KEYPAIR)","exists":'$$KEYPAIR_EXISTS',"programId":"'$${PROGRAM_ID}'"},"timestamp":%s}\n' "$$(date +%s000)" >> $(LOG_PATH)
	# #endregion agent log
	# #region agent log
	@BALANCE_VAL=""; BALANCE_OK=true; \
	BALANCE_VAL=$$(solana balance --url $(RPC_URL) 2>/dev/null | awk '{print $$1}'); \
	if [ -z "$$BALANCE_VAL" ]; then BALANCE_OK=false; BALANCE_VAL="unknown"; fi; \
	printf '{"sessionId":"debug-session","runId":"pre","hypothesisId":"H3","location":"Makefile:deploy.balance","message":"wallet balance","data":{"balance":"'$${BALANCE_VAL}'","ok":'$$BALANCE_OK',"rpcUrl":"$(RPC_URL)"},"timestamp":%s}\n' "$$(date +%s000)" >> $(LOG_PATH)
	# #endregion agent log
	@echo "Upgrade authority: $(KEYPAIR)"
	@echo "Deploying program \"$(PROGRAM_NAME)\"..."
	# #region agent log
	@DEPLOY_OUTPUT=$$(solana program deploy $(PROGRAM_SO) --program-id $(PROGRAM_KEYPAIR) --keypair $(KEYPAIR) --url $(RPC_URL) 2>&1); \
	DEPLOY_STATUS=$$?; \
	printf '{"sessionId":"debug-session","runId":"pre","hypothesisId":"H1","location":"Makefile:deploy.result","message":"deploy finished","data":{"status":'$$DEPLOY_STATUS',"rpcUrl":"$(RPC_URL)"},"timestamp":%s}\n' "$$(date +%s000)" >> $(LOG_PATH); \
	echo "$$DEPLOY_OUTPUT"; \
	exit $$DEPLOY_STATUS
	# #endregion agent log
	@solana program deploy $(PROGRAM_SO) \
		--program-id $(PROGRAM_KEYPAIR) \
		--keypair $(KEYPAIR) \
		--url $(RPC_URL)
	@$(eval PROGRAM_ID := $(shell solana address -k $(PROGRAM_KEYPAIR)))
	@echo ""
	@echo "$(GREEN)Deploy success!$(NC)"
	@echo "$(GREEN)Program Id: $(PROGRAM_ID)$(NC)"
	@echo ""
	@echo "Solscan: https://solscan.io/account/$(PROGRAM_ID)?cluster=$(CLUSTER)"
	@echo "Solana.fm: https://solana.fm/address/$(PROGRAM_ID)?cluster=$(CLUSTER)-solana"

deploy-and-test: deploy
	@echo ""
	@echo "$(CYAN)Running test transaction...$(NC)"
	@RPC_URL="$(RPC_URL)" node scripts/test-store-key.mjs

clean:
	cargo clean
	rm -rf target/deploy
