#!/bin/bash
set -e

# Force immediate output
exec 1>&1

# Colors and symbols for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
CHECK_MARK="✓"
X_MARK="✗"
WARNING_MARK="⚠"
INFO_MARK="ℹ"

# Create output directory if it doesn't exist
mkdir -p "docs/generated"

echo -e "${BLUE}${INFO_MARK} Generating Mermaid class diagrams from TypeScript source...${NC}"

# Run the typescript-graph diagram generation script
if node scripts/generate-typescript-graph.js; then
    echo -e "${GREEN}${CHECK_MARK} Mermaid class diagrams generated successfully${NC}"
else
    echo -e "${RED}${X_MARK} Failed to generate Mermaid class diagrams${NC}"
    exit 1
fi

# Update timestamp in documentation files
for doc_file in docs/class-structure.md docs/data-models.md docs/transaction-models.md; do
    if [ -f "$doc_file" ]; then
        # Update timestamp or add it if it doesn't exist
        timestamp="Last updated: $(date +%Y-%m-%d) at $(date +%H:%M:%S)"
        if grep -q "Last updated:" "$doc_file"; then
            sed -i "s/Last updated:.*/$timestamp/" "$doc_file"
        else
            echo -e "\n\n$timestamp" >> "$doc_file"
        fi
        echo -e "${GREEN}${CHECK_MARK} Updated timestamp in $doc_file${NC}"
    fi
done

echo -e "\n${GREEN}Documentation build complete!${NC}"
echo -e "${BLUE}${INFO_MARK} Generated documentation files:${NC}"
echo -e "  - docs/generated/class-diagram.md (Mermaid class diagram)"
echo -e "  - docs/class-structure.md (Updated with Mermaid diagram and timestamp)"
echo -e "  - docs/data-models.md (Updated timestamp)"
echo -e "  - docs/transaction-models.md (Updated timestamp)"
