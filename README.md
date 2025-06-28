# Naucto Frontend

---

## Prerequisites

- [Docker](https://www.docker.com/) should be installed
---

## setup

```bash
  docker build -t frontend:latest .
```
  
#### vscode workspace recommended for eslint
click to **File** then **Open workspace from file** and select the **settings/vscode/frontend.code-workspace** file

## Development

```bash
  docker run -it -p 3001:3001 -v ${PWD}:/app -v /app/node_modules frontend
```

## Recommended Extension

For a better development experience, consider installing the [React Developer Tools](https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi) extension on Google Chrome to inspect and debug React components more effectively.