# zst
前端构建工具

## Installation
`npm install zst -g`  
make sure zst installed, you an use `zst --version`

## Purpose
The intention of this project is provide a tool that make managing the fe develop.
## Features
#### develop
Realize livereload: When you are in development environment, this tool will help you to refresh the html when files changed.
#### production
1. bundle css/js;
2. add timestamp;
3. generate new html without annotation
4. copy favicon.ico

#### Pattern
1. pc  
when you use pc pattern, you must set `config.isPhone = false` in zst.config.js
2. phone  
when you use phone pattern, you must set `config.isPhone = true` in zst.config.js

## API
Publish: `zst dist`  
Develop: `zst dev`
