.PHONY: help install dev dev-client dev-server dev-local build build-client build-server clean clean-client clean-server test lint setup-env supabase-start supabase-stop supabase-status supabase-reset

# Default target
help:
	@echo "VoiceBoard - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install       - Install all dependencies (client + server)"
	@echo "  make setup-env     - Create .env files from examples"
	@echo "  make setup-local   - Setup local Supabase environment"
	@echo ""
	@echo "Development:"
	@echo "  make dev-client    - Start frontend dev server"
	@echo "  make dev-server    - Start backend server"
	@echo "  make dev-local     - Start all services locally (Supabase + Client + Server)"
	@echo "  make dev           - Start both (requires tmux/separate terminals)"
	@echo ""
	@echo "Local Supabase:"
	@echo "  make supabase-start   - Start local Supabase (Docker)"
	@echo "  make supabase-stop    - Stop local Supabase"
	@echo "  make supabase-status  - Check Supabase status"
	@echo "  make supabase-reset   - Reset local database"
	@echo ""
	@echo "Build:"
	@echo "  make build         - Build both client and server"
	@echo "  make build-client  - Build frontend only"
	@echo "  make build-server  - Build backend only"
	@echo ""
	@echo "Clean:"
	@echo "  make clean         - Clean all build artifacts"
	@echo "  make clean-client  - Clean frontend build"
	@echo "  make clean-server  - Clean backend build"
	@echo ""
	@echo "Testing:"
	@echo "  make lint          - Lint frontend code"
	@echo "  make test          - Run all tests (when implemented)"

# Installation
install:
	@echo "Installing frontend dependencies..."
	cd client && npm install
	@echo "Building backend..."
	cd server && ./gradlew build
	@echo "✓ Installation complete"

setup-env:
	@echo "Creating .env files from examples..."
	@test -f client/.env || (cp client/.env.example client/.env && echo "✓ Created client/.env")
	@test -f server/.env || (cp server/.env.example server/.env && echo "✓ Created server/.env")
	@echo "⚠ Remember to fill in your actual credentials!"

setup-local:
	@echo "Setting up local Supabase environment..."
	@echo "\nStarting Supabase..."
	@supabase start
	@echo "\n✓ Local Supabase started!"
	@echo "\nUpdating .env files with local credentials..."
	@supabase status --output env > /tmp/supabase-env.txt
	@echo "VITE_SUPABASE_URL=http://127.0.0.1:54321" > client/.env
	@echo "VITE_SUPABASE_PUBLISHABLE_KEY=$$(grep ANON_KEY /tmp/supabase-env.txt | cut -d= -f2)" >> client/.env
	@echo "VITE_WS_URL=ws://localhost:8080/ws" >> client/.env
	@echo "SUPABASE_URL=http://127.0.0.1:54321" > server/.env
	@echo "DEEPGRAM_API_KEY=your-deepgram-api-key" >> server/.env
	@echo "PORT=8080" >> server/.env
	@echo "✓ Environment files created with local Supabase credentials"
	@echo "\n📋 Local Supabase Dashboard: http://127.0.0.1:54323"
	@echo "📧 Studio Email: test@test.com"
	@echo "🔑 Studio Password: test1234"
	@echo "\n⚠ Don't forget to add your Deepgram API key to server/.env"

# Development
dev-client:
	cd client && npm run dev

dev-server:
	@if [ ! -f server/.env ]; then \
		echo "⚠ server/.env not found. Run 'make setup-env' first"; \
		exit 1; \
	fi
	cd server && export $$(cat .env | grep -v '^#' | xargs) && ./gradlew run

dev:
	@echo "Starting VoiceBoard in development mode..."
	@echo "This requires tmux or run in separate terminals:"
	@echo "  Terminal 1: make dev-server"
	@echo "  Terminal 2: make dev-client"

dev-local:
	@echo "Starting VoiceBoard with local Supabase..."
	@echo "This requires 3 terminals:"
	@echo "  Terminal 1: make supabase-start"
	@echo "  Terminal 2: make dev-server"
	@echo "  Terminal 3: make dev-client"

# Build
build: build-client build-server
	@echo "✓ Build complete"

build-client:
	@echo "Building frontend..."
	cd client && npm run build
	@echo "✓ Frontend built to client/dist"

build-server:
	@echo "Building backend..."
	cd server && ./gradlew build
	@echo "✓ Backend built to server/build"

# Clean
clean: clean-client clean-server
	@echo "✓ All build artifacts cleaned"

clean-client:
	@echo "Cleaning frontend..."
	cd client && rm -rf dist node_modules/.vite
	@echo "✓ Frontend cleaned"

clean-server:
	@echo "Cleaning backend..."
	cd server && ./gradlew clean
	@echo "✓ Backend cleaned"

# Testing & Linting
lint:
	@echo "Linting frontend..."
	cd client && npm run lint

test:
	@echo "Running tests..."
	@echo "⚠ Tests not yet implemented"
	# cd client && npm test
	# cd server && ./gradlew test

# Quick checks
check-env:
	@echo "Checking environment variables..."
	@echo "\nClient (.env):"
	@test -f client/.env && echo "✓ client/.env exists" || echo "✗ client/.env missing"
	@echo "\nServer (.env):"
	@test -f server/.env && echo "✓ server/.env exists" || echo "✗ server/.env missing"
	@if [ -f server/.env ]; then \
		echo "\nServer env vars:"; \
		grep -v '^#' server/.env | grep '=' | cut -d= -f1 | sed 's/^/  - /'; \
	fi
	@if [ -f client/.env ]; then \
		echo "\nClient env vars:"; \
		grep -v '^#' client/.env | grep '=' | cut -d= -f1 | sed 's/^/  - /'; \
	fi

# Supabase Local Development
supabase-start:
	@echo "Starting local Supabase..."
	@supabase start
	@echo "\n✓ Supabase started!"
	@echo "📋 Dashboard: http://127.0.0.1:54323"
	@echo "🔗 API: http://127.0.0.1:54321"

supabase-stop:
	@echo "Stopping local Supabase..."
	@supabase stop
	@echo "✓ Supabase stopped"

supabase-status:
	@supabase status

supabase-reset:
	@echo "Resetting local database..."
	@supabase db reset
	@echo "✓ Database reset"
