# Makefile for KeyShield Solana program deployment

PROGRAM_NAME := keyshield
PROGRAM_SO := target/deploy/$(PROGRAM_NAME).so
PROGRAM_KEYPAIR := target/deploy/$(PROGRAM_NAME)-keypair.json
KEYPAIR := $(HOME)/.config/solana/id.json

# Default cluster
CLUSTER ?= devnet

# RPC URLs (replace YOUR_HELIUS_API_KEY with your key, or use public devnet)
RPC_DEVNET := https://api.devnet.solana.com
# RPC_DEVNET := https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
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

.PHONY: build deploy deploy-and-test clean

build:
	@echo "Building Rust program for Solana..."
	cargo build-sbf
	@echo "Build complete: $(PROGRAM_SO)"

deploy: build
	@echo "Deploying to $(CLUSTER)..."
	@solana config set --url $(RPC_URL)
	@echo "Upgrade authority: $(KEYPAIR)"
	@echo "Deploying program \"$(PROGRAM_NAME)\"..."
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
