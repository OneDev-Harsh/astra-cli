## Question

list all the tools available in the modes/agent folder and give a brief description of each of those and also an example on how can I use them through the agent mode

## Answer

Based on my analysis of the `modes/agent` folder, here's a comprehensive overview of all the tools available in agent mode:

## 📁 Agent Mode Tools Overview

The agent mode provides **30+ specialized tools** organized across several categories:

---

### 🔍 **File Reading & Analysis Tools**

1. **`read_file`** - Read a text file from the workspace
   - *Example:* `Read the contents of src/index.ts`

2. **`read_multiple_files`** - Read multiple files in a single call
   - *Example:* `Read package.json, tsconfig.json, and src/main.ts`

3. **`list_files`** - List files and directories under a path
   - *Example:* `List all files in the src directory recursively`

4. **`search_files`** - Find files matching a glob pattern with optional content filter
   - *Example:* `Find all TypeScript files containing "useState"`

5. **`analyze_codebase`** - Summarize structure (file counts, directories)
   - *Example:* `Analyze the project structure`

6. **`grep`** - Search file contents using text query
   - *Example:* `Search for "TODO" in all files case-insensitively`

---

### ✏️ **File Modification Tools**

7. **`create_file`** - Stage creation of a new file (pending approval)
   - *Example:* `Create a new file called utils/helpers.ts with helper functions`

8. **`modify_file`** - Stage a full-file replacement (pending approval)
   - *Example:* `Update src/config.ts with new configuration`

9. **`delete_file`** - Stage deletion of a file (pending approval)
   - *Example:* `Remove the deprecated old-component.tsx`

10. **`create_folder`** - Stage creation of a directory tree (pending approval)
    - *Example:* `Create a new folder structure src/components/ui`

11. **`replace_in_file`** - Replace text inside a file while preserving the rest
    - *Example:* `Replace "localhost" with "api.example.com" in config.ts`

12. **`append_to_file`** - Append content to the end of a file
    - *Example:* `Add a new export statement to index.ts`

13. **`insert_at_line`** - Insert content at a specific line
    - *Example:* `Insert import statement at line 5 of App.tsx`

---

### 🖥️ **Command Execution Tools**

14. **`run_command`** - Run a command immediately and capture output
    - *Example:* `Run npm install`

15. **`run_background_command`** - Start a long-running process
    - *Example:* `Start the development server in background`

16. **`execute_shell`** - Queue a shell command for approval before execution
    - *Example:* `Run database migration script`

---

### 🔧 **Git Tools**

17. **`git_status`** - Get git status
    - *Example:* `Show current git status`

18. **`git_diff`** - Get git diff (staged or unstaged)
    - *Example:* `Show unstaged changes`

19. **`git_log`** - Get recent commits
    - *Example:* `Show last 10 commits`

---

### 🧪 **Testing & Quality Tools**

20. **`run_tests`** - Run the project's test suite
    - *Example:* `Run all tests`

21. **`run_test_file`** - Run a specific test file
    - *Example:* `Run tests in src/utils.test.ts`

22. **`lint_project`** - Run linting
    - *Example:* `Check code for linting errors`

23. **`format_project`** - Run formatting
    - *Example:* `Format all code with Prettier`

---

### 🌐 **Web & Documentation Tools**

24. **`web_search`** - Search the web for documentation
    - *Example:* `Search for React hooks documentation`

25. **`fetch_url`** - Fetch and summarize a URL
    - *Example:* `Get the content from https://api.example.com/docs`

---

### 📋 **Project Analysis Tools**

26. **`detect_framework`** - Detect framework, package manager and language
    - *Example:* `What framework is this project using?`

27. **`read_package_json`** - Read package.json summary
    - *Example:* `Show project dependencies and scripts`

---

### 🎯 **Planning Tools**

28. **`create_plan`** - Create a task execution plan
    - *Example:* `Create a plan to refactor the authentication system`

29. **`get_plan`** - Retrieve current plan
    - *Example:* `Show the current execution plan`

---

### 🔄 **Change Management Tools**

30. **`show_pending_changes`** - Show staged file operations
    - *Example:* `What changes are waiting to be applied?`

31. **`apply_changes`** - Apply staged operations
    - *Example:* `Apply all approved changes`

32. **`discard_changes`** - Discard staged operations
    - *Example:* `Cancel all pending changes`

---

### 🛠️ **Skill Tools**

33. **`list_skills`** - List available SKILL.md files
    - *Example:* `Show all available skills`

34. **`read_skill`** - Read a SKILL.md file
    - *Example:* `Read the react-patterns skill`

---

## 💡 **How to Use These Tools Through Agent Mode**

When you activate agent mode, you can simply describe what you want to do in natural language. The agent will automatically select and use the appropriate tools. Here are some examples:

### Example 1: Code Analysis
```
You: "Analyze the project structure and find all TypeScript files"
Agent: Uses analyze_codebase + search_files("*.ts")
```

### Example 2: File Modification
```
You: "Create a new utility file with helper functions"
Agent: Uses create_file (stages for approval)
```

### Example 3: Testing
```
You: "Run tests and fix any linting issues"
Agent: Uses run_tests + lint_project + modify_file (if needed)
```

### Example 4: Git Workflow
```
You: "Show me what changes I've made and create a summary"
Agent: Uses git_status + git_diff + web_search (for context)
```

### Example 5: Complex Task
```
You: "Refactor the authentication system to use JWT tokens"
Agent: Uses create_plan → read_file → modify_file → run_tests → apply_changes
```

---

## 🔐 **Key Features**

- **Staged Changes**: All file modifications are staged until you approve them
- **Safety**: Path validation prevents access outside workspace
- **Exclusion Patterns**: Automatically excludes node_modules, .git, etc.
- **Approval Flow**: Interactive review before applying changes
- **Error Handling**: Comprehensive error reporting and rollback capability

The agent mode is designed to be powerful yet safe, giving you full control over what changes get applied to your codebase!
