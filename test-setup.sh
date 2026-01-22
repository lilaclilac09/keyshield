#!/bin/bash
# KeyShield Test Setup Script
# This script automates the setup process for testing

set -e  # Exit on error

echo "=========================================="
echo "KeyShield Test Setup Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Check prerequisites
echo "Step 1: Checking prerequisites..."
echo "-----------------------------------"

if command -v rustc &> /dev/null; then
    RUST_VERSION=$(rustc --version)
    print_status "Rust installed: $RUST_VERSION"
else
    print_error "Rust not found. Please install Rust: https://rustup.rs"
    exit 1
fi

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_status "Node.js installed: $NODE_VERSION"
    
    # Check Node version
    NODE_MAJOR=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -lt 18 ]; then
        print_warning "Node.js version should be 18+. Current: $NODE_VERSION"
    fi
else
    print_error "Node.js not found. Please install Node.js 18+: https://nodejs.org"
    exit 1
fi

if command -v solana &> /dev/null; then
    SOLANA_VERSION=$(solana --version)
    print_status "Solana CLI installed: $SOLANA_VERSION"
else
    print_error "Solana CLI not found. Please install: https://docs.solana.com/cli/install-solana-cli-tools"
    exit 1
fi

echo ""

# Step 2: Configure Solana
echo "Step 2: Configuring Solana..."
echo "-----------------------------------"

# Check current cluster
CURRENT_CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}' || echo "")
if [[ "$CURRENT_CLUSTER" == *"devnet"* ]]; then
    print_status "Already configured for devnet"
else
    print_warning "Setting cluster to devnet..."
    solana config set --url devnet
    print_status "Cluster set to devnet"
fi

# Check wallet
WALLET_ADDRESS=$(solana address 2>/dev/null || echo "")
if [ -z "$WALLET_ADDRESS" ]; then
    print_warning "No wallet keypair found. Generating new keypair..."
    solana-keygen new --no-bip39-passphrase
    WALLET_ADDRESS=$(solana address)
fi
print_status "Wallet address: $WALLET_ADDRESS"

# Check balance
BALANCE=$(solana balance 2>/dev/null | awk '{print $1}' || echo "0")
if (( $(echo "$BALANCE < 1" | bc -l) )); then
    print_warning "Low balance: $BALANCE SOL. Requesting airdrop..."
    solana airdrop 2
    sleep 2
    BALANCE=$(solana balance | awk '{print $1}')
fi
print_status "Balance: $BALANCE SOL"

echo ""

# Step 3: Build program
echo "Step 3: Building Solana program..."
echo "-----------------------------------"

cd "$(dirname "$0")"

if [ ! -f "Cargo.toml" ]; then
    print_error "Cargo.toml not found. Are you in the keyshield directory?"
    exit 1
fi

print_status "Building program (this may take a few minutes)..."
if cargo build-sbf 2>&1 | tee build.log; then
    print_status "Build successful!"
    
    if [ -f "target/deploy/keyshield.so" ]; then
        FILE_SIZE=$(ls -lh target/deploy/keyshield.so | awk '{print $5}')
        print_status "Program binary: target/deploy/keyshield.so ($FILE_SIZE)"
    else
        print_error "Program binary not found after build"
        exit 1
    fi
else
    print_error "Build failed. Check build.log for details"
    exit 1
fi

echo ""

# Step 4: Deploy program
echo "Step 4: Deploying program..."
echo "-----------------------------------"

print_status "Deploying to devnet..."
DEPLOY_OUTPUT=$(solana program deploy target/deploy/keyshield.so --output json 2>&1)

if [ $? -eq 0 ]; then
    PROGRAM_ID=$(echo "$DEPLOY_OUTPUT" | grep -o '"programId":"[^"]*"' | cut -d'"' -f4 || echo "")
    
    if [ -z "$PROGRAM_ID" ]; then
        # Try alternative parsing
        PROGRAM_ID=$(solana program show --programs | grep keyshield | awk '{print $1}' | head -1 || echo "")
    fi
    
    if [ -n "$PROGRAM_ID" ]; then
        print_status "Program deployed successfully!"
        print_status "Program ID: $PROGRAM_ID"
        echo ""
        echo "=========================================="
        echo "PROGRAM ID: $PROGRAM_ID"
        echo "=========================================="
        echo ""
    else
        print_warning "Could not parse Program ID from output"
        print_warning "Please check deployment output manually"
        echo "$DEPLOY_OUTPUT"
    fi
else
    print_error "Deployment failed"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo ""

# Step 5: Setup frontend
echo "Step 5: Setting up frontend..."
echo "-----------------------------------"

if [ ! -d "frontend" ]; then
    print_error "frontend directory not found"
    exit 1
fi

cd frontend

# Install dependencies
if [ ! -d "node_modules" ]; then
    print_status "Installing npm dependencies (this may take a few minutes)..."
    npm install
    print_status "Dependencies installed"
else
    print_status "Dependencies already installed"
fi

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    print_status "Creating .env.local file..."
    cat > .env.local << EOF
# Solana Configuration
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID

# Lit Protocol Configuration
NEXT_PUBLIC_LIT_NETWORK=datil

# Arcium Configuration
NEXT_PUBLIC_ARCIUM_CLUSTER=testnet

# Bonsol Configuration (if using API)
NEXT_PUBLIC_BONSOL_API_URL=https://api.bonsol.org
EOF
    print_status ".env.local created"
else
    print_warning ".env.local already exists"
    
    # Update PROGRAM_ID if it exists
    if [ -n "$PROGRAM_ID" ]; then
        if grep -q "NEXT_PUBLIC_PROGRAM_ID" .env.local; then
            # Update existing PROGRAM_ID
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                sed -i '' "s|NEXT_PUBLIC_PROGRAM_ID=.*|NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID|" .env.local
            else
                # Linux
                sed -i "s|NEXT_PUBLIC_PROGRAM_ID=.*|NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID|" .env.local
            fi
            print_status "Updated PROGRAM_ID in .env.local"
        else
            # Add PROGRAM_ID
            echo "NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID" >> .env.local
            print_status "Added PROGRAM_ID to .env.local"
        fi
    fi
fi

echo ""

# Step 6: Summary
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Start the frontend:"
echo "   ${GREEN}cd frontend && npm run dev${NC}"
echo ""
echo "2. Open your browser:"
echo "   ${GREEN}http://localhost:3000${NC}"
echo ""
echo "3. Follow the testing guide:"
echo "   ${GREEN}See TESTING_GUIDE.md${NC}"
echo ""
if [ -n "$PROGRAM_ID" ]; then
    echo "Program ID: ${GREEN}$PROGRAM_ID${NC}"
    echo ""
    echo "Save this Program ID for reference!"
fi
echo "=========================================="
