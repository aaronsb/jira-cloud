# TypeScript Graph

```bash
tsg --md /home/aaron/mcp/jira-cloud/docs/generated/class-diagram.md --dir /home/aaron/mcp/jira-cloud --include src/client src/handlers src/types --exclude node_modules test tests coverage build --highlight jira-client.ts issue-handlers.ts board-handlers.ts search-handlers.ts --LR
```

```mermaid
flowchart LR
    classDef highlight fill:yellow,color:black
    subgraph src["src"]
        src/index.ts["index.ts"]
        subgraph src/types["/types"]
            src/types/index.ts["index.ts"]
        end
        subgraph src/client["/client"]
            src/client/jira//client.ts["jira-client.ts"]:::highlight
        end
        subgraph src/handlers["/handlers"]
            src/handlers/board//handlers.ts["board-handlers.ts"]:::highlight
            src/handlers/issue//handlers.ts["issue-handlers.ts"]:::highlight
            src/handlers/project//handlers.ts["project-handlers.ts"]
            src/handlers/search//handlers.ts["search-handlers.ts"]:::highlight
        end
        subgraph src/utils["/utils"]
            src/utils/text//processing.ts["text-processing.ts"]
        end
    end
    src/utils/text//processing.ts-->src/types/index.ts
    src/client/jira//client.ts-->src/types/index.ts
    src/client/jira//client.ts-->src/utils/text//processing.ts
    src/handlers/board//handlers.ts-->src/client/jira//client.ts
    src/handlers/board//handlers.ts-->src/types/index.ts
    src/handlers/issue//handlers.ts-->src/client/jira//client.ts
    src/handlers/project//handlers.ts-->src/client/jira//client.ts
    src/handlers/search//handlers.ts-->src/client/jira//client.ts
    src/index.ts-->src/client/jira//client.ts
    src/index.ts-->src/handlers/board//handlers.ts
    src/index.ts-->src/handlers/issue//handlers.ts
    src/index.ts-->src/handlers/project//handlers.ts
    src/index.ts-->src/handlers/search//handlers.ts
```

