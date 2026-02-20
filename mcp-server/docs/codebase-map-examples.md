# codebase_map File Type Examples

This document shows input/output examples for each supported file type in the new `codebase_map` tool.

---

## Table of Contents

1. [TypeScript/JavaScript](#typescriptjavascript)
2. [HTML](#html)
3. [CSS](#css)
4. [JSON](#json)
5. [YAML](#yaml)
6. [Markdown](#markdown)
7. [XML](#xml)
8. [Multiple File Types](#multiple-file-types-combined)
9. [Mixed Queries](#mixed-queries-with-filters)

---

## TypeScript/JavaScript

### Input
```json
{
  "scope": { "include": "src/services" },
  "show": { "folders": true, "files": true, "symbols": ["classes", "functions"] },
  "detail": "signatures"
}
```

### Output
```
src/
  services/
    auth/
      AuthService.ts
        class AuthService
          constructor(config: Config)
          authenticate(token: string): Promise<User>
      index.ts
    payment/
      PaymentProcessor.ts
        class PaymentProcessor
          processPayment(amount: number): Promise<Result>
```

### Symbol Types Available
- `functions` → function declarations
- `classes` → class declarations  
- `interfaces` → interface declarations
- `types` → type aliases
- `constants` → const declarations
- `enums` → enum declarations
- `methods` → class methods
- `properties` → class properties
- `*` → all symbols

---

## HTML

### Input
```json
{
  "scope": { "include": "**/*.html" },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
index.html
  <html>
    <head> type="header.css" rel="stylesheet"
      <title>
      <meta> charset="UTF-8"
      <link> rel="stylesheet"
    <body>
      <header> #main-header
      <nav> .navigation
      <main> #content
        <article> .post
        <section> .sidebar
      <footer> #page-footer
```

### Symbol Types Available
- Semantic tags: `<html>`, `<head>`, `<body>`, `<header>`, `<nav>`, `<main>`, etc.
- Details include: `id`, `class`, `type`, `name`, `src`, `href`, `rel`

---

## CSS

### Input
```json
{
  "scope": { "include": "**/*.css" },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
styles.css
  @import url(reset.css)
  @media screen and (min-width:768px)
    .container
    .sidebar
  @keyframes fadeIn
    from
    to
  :root
    --color-primary
    --color-secondary
    --spacing-md
  .button
  .button:hover
  #header
  [data-theme="dark"]
```

### Symbol Types Available
- **Selectors**: `.class`, `#id`, `element`, `[attr]`
- **At-rules**: `@import`, `@media`, `@keyframes`, `@font-face`, `@property`, `@layer`, etc.
- **Custom Properties**: `--variable-name`

---

## JSON

### Input
```json
{
  "scope": { "include": "**/*.json" },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
package.json
  name: "my-project"
  version: "1.0.0"
  scripts: 5 items
    dev: "npm run dev"
    build: "npm run build"
    test: "jest"
  dependencies: 12 items
    react: "^18.0.0"
    typescript: "^5.0.0"
  devDependencies: 8 items
tsconfig.json
  compilerOptions: 15 items
    target: "ES2022"
    module: "NodeNext"
    strict: true
```

### Symbol Types Available
- Object keys with values
- Array indices with item count
- Value previews (truncated to 60 chars)

---

## YAML

### Input
```json
{
  "scope": { "include": "**/*.yaml" },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
config.yaml
  database:
    host: "localhost"
    port: 5432
    name: "myapp"
  redis:
    url: "redis://localhost:6379"
  features: 3 items
    analytics: true
    notifications: false
docker-compose.yaml
  version: "3.8"
  services:
    api:
      image: "node:18"
      ports: 1 items
    db:
      image: "postgres:15"
```

### Symbol Types Available
- Keys with values
- Nested objects
- Array item counts

---

## Markdown

### Input
```json
{
  "scope": { "include": "**/*.md" },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
README.md
  # Project Name (heading-1)
    ## Installation (heading-2)
      ### Prerequisites (heading-3)
    ## Usage (heading-2)
      ### API Reference (heading-3)
        #### Methods (heading-4)
    ## Contributing (heading-2)
docs/api.md
  # API Documentation (heading-1)
    ## Authentication (heading-2)
      ### OAuth Flow (heading-3)
    ## Endpoints (heading-2)
      ### /users (heading-3)
      ### /products (heading-3)
```

### Symbol Types Available
- Headings (h1-h6) with hierarchy
- Code blocks (with language)
- YAML frontmatter

---

## XML

### Input
```json
{
  "scope": { "include": "**/*.xml" },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
config.xml
  <configuration>
    <appSettings>
      <add> key="ApiUrl" value="https://api.example.com"
      <add> key="Timeout" value="30"
    <connectionStrings>
      <add> name="Default" connectionString="..."
pom.xml
  <project>
    <modelVersion> "4.0.0"
    <groupId> "com.example"
    <artifactId> "my-app"
    <version> "1.0-SNAPSHOT"
    <dependencies>
      <dependency>
```

### File Extensions Supported
- `.xml`, `.svg`, `.xaml`, `.plist`
- `.csproj`, `.vbproj`, `.fsproj`
- `.props`, `.targets`, `.resx`
- `.wsdl`, `.config`, `.nuspec`

---

## Multiple File Types (Combined)

### Input: All Web Files
```json
{
  "scope": { "include": ["**/*.html", "**/*.css", "**/*.js"] },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "names"
}
```

### Output
```
public/
  index.html
    <html>
      <head>
      <body>
  styles/
    main.css
      @import
      :root
      .container
      .button
  scripts/
    app.js
      function init
      function loadData
      class AppController
```

---

### Input: Config Files Only
```json
{
  "scope": { "include": ["**/*.json", "**/*.yaml", "**/*.toml"] },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "signatures"
}
```

### Output
```
config/
  settings.json
    apiUrl: "https://..."
    timeout: 5000
  database.yaml
    host: "localhost"
    port: 5432
  app.toml
    title: "My App"
    version: "1.0.0"
.vscode/
  settings.json
    editor.fontSize: 14
    typescript.preferences.quoteStyle: "single"
```

---

### Input: Documentation Only
```json
{
  "scope": { "include": ["**/*.md", "**/*.html"], "exclude": ["node_modules/**"] },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "names"
}
```

### Output
```
docs/
  README.md
    # Overview
      ## Features
      ## Installation
  api/
    reference.md
      # API Reference
        ## Endpoints
    guide.html
      <html>
        <body>
          <main>
```

---

## Mixed Queries with Filters

### Input: Source Code without Tests
```json
{
  "scope": { 
    "include": "src",
    "exclude": ["**/*.test.ts", "**/*.spec.ts", "**/__tests__/**"]
  },
  "show": { "files": true, "symbols": ["classes", "functions", "interfaces"] },
  "detail": "signatures"
}
```

### Input: Frontend Only
```json
{
  "scope": { "include": ["src/components/**", "src/pages/**", "**/*.css"] },
  "show": { "files": true, "symbols": ["*"] },
  "detail": "names"
}
```

### Input: Backend Services
```json
{
  "scope": { "include": ["src/services/**", "src/api/**"] },
  "show": { "files": true, "symbols": ["classes", "functions"] },
  "detail": "full"
}
```

---

## Detail Levels Comparison

### `detail: "minimal"` — Structure only
```
src/
  services/
    AuthService.ts
    PaymentService.ts
```

### `detail: "names"` — Symbol names with type keywords
```
src/
  services/
    AuthService.ts
      class AuthService
      function createAuthToken
    PaymentService.ts
      class PaymentService
```

### `detail: "signatures"` — Full TypeScript signatures
```
src/
  services/
    AuthService.ts
      class AuthService
        authenticate(token: string): Promise<User>
        validateSession(sessionId: string): boolean
```

### `detail: "full"` — Signatures + JSDoc
```
src/
  services/
    AuthService.ts
      /** Service for user authentication. */
      class AuthService
        /** Authenticate user with bearer token. */
        authenticate(token: string): Promise<User>
```

---

## File Type Detection

The tool automatically detects file types by extension:

| Extension | Parser Used |
|-----------|-------------|
| `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | TypeScript Language Service |
| `.json`, `.jsonc`, `.json5` | JSON Parser |
| `.jsonl` | JSONL Parser (line-by-line) |
| `.yaml`, `.yml` | YAML Parser |
| `.toml` | TOML Parser |
| `.css`, `.scss`, `.less` | CSS Parser |
| `.html`, `.htm`, `.xhtml` | HTML Parser |
| `.xml`, `.svg`, `.xaml`, etc. | XML Parser |
| `.md`, `.markdown` | Markdown Parser |
| Other | VS Code DocumentSymbolProvider |

---

*Generated for codebase_map v2 with Markdown output*
