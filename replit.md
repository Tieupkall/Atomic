# Overview

This repository contains a comprehensive Facebook Messenger Bot built in Node.js, designed for automation, entertainment, and group management. The bot features a modular architecture with extensive functionality including AI chat integration, multimedia processing, gaming systems, administrative tools, and various utility commands. It's built as a long-running service with web interfaces for monitoring and management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Bot Framework
- **Entry Point**: `index.js` serves as the main process manager with Express.js web server for monitoring
- **Bot Logic**: `ATOMIC.js` contains the core client initialization and global utilities
- **Facebook Integration**: Custom Facebook Chat API implementation in `/includes/fca/` with authentication handling
- **Module System**: Commands and events are organized in `/modules/commands/` and `/modules/events/` with dynamic loading
- **Database Layer**: SQLite-based storage using Sequelize ORM for users, threads, and currencies data

## Authentication & Login System
- **Multi-Account Support**: Account switching functionality with encrypted credentials storage
- **2FA Integration**: Support for two-factor authentication using TOTP generators
- **Session Management**: Automatic login recovery and session persistence via appstate.json
- **Security Features**: Anti-detection mechanisms and proxy support for enhanced privacy

## Command & Event Processing
- **Command Handler**: Centralized command processing with permission levels, cooldowns, and usage tracking
- **Event System**: Real-time handling of Facebook events (messages, reactions, group changes, etc.)
- **Reply System**: Support for interactive conversations and multi-step command workflows
- **Reaction Handling**: Interactive reaction-based interfaces for enhanced user experience

## Gaming & Entertainment
- **Tiền Hiệp System**: Complete cultivation/RPG game with levels, monsters, materials, and equipment
- **Media Processing**: Video/audio streaming from multiple platforms (YouTube, TikTok, Instagram, etc.)
- **AI Chat Integration**: Google Generative AI integration with conversation memory and context awareness
- **Image Generation**: AI-powered image creation with customizable parameters

## Administrative Features
- **Group Management**: Advanced controls for themes, emojis, member management, and anti-spam protection
- **User Moderation**: Ban/unban system, automatic moderation, and warning systems
- **Bot Configuration**: Dynamic settings management with per-group customization
- **Monitoring Tools**: Real-time bot status monitoring, usage analytics, and error tracking

## Data Management
- **File Storage**: Organized data structure with backups, caching, and temporary file management
- **Configuration System**: Hierarchical config files supporting global and per-group settings
- **Logging**: Comprehensive logging system with colored output and error tracking
- **Database Models**: Structured data models for users, threads, currencies, and game data

## Development Tools
- **Hot Reloading**: File watcher for automatic command/event reloading during development
- **Code Management**: Integrated code sharing and deployment tools via atomic-note integration
- **Debugging**: Developer mode with enhanced logging and debugging capabilities
- **Proxy Support**: HTTP/HTTPS proxy configuration for development and deployment flexibility

# External Dependencies

## Core Dependencies
- **facebook-chat-api**: Custom implementation for Facebook Messenger integration
- **express**: Web server for monitoring interface and API endpoints
- **sequelize**: ORM for database operations with SQLite backend
- **sqlite3/better-sqlite3**: Database engine for persistent data storage
- **axios**: HTTP client for external API communications

## Media Processing
- **@distube/ytdl-core**: YouTube video/audio extraction and streaming
- **canvas**: Image manipulation and generation capabilities
- **cheerio**: HTML parsing for web scraping functionality
- **archiver**: File compression for backup and export features

## AI & Machine Learning
- **@google/generative-ai**: Google's Generative AI for chat responses and content generation
- **speakeasy**: Two-factor authentication TOTP generation
- **javascript-obfuscator**: Code protection and obfuscation

## Utility Libraries
- **moment-timezone**: Time handling with timezone support (Asia/Ho_Chi_Minh)
- **chalk/gradient-string**: Enhanced console logging with colors and gradients
- **figlet**: ASCII art generation for startup displays
- **fs-extra**: Extended file system operations
- **crypto-js**: Encryption and security utilities

## Development & Monitoring
- **chokidar**: File watching for development hot-reloading
- **ws**: WebSocket support for real-time features
- **multer**: File upload handling for web interface
- **node-cron**: Scheduled task management
- **mqtt**: Message queuing for distributed features

## Optional Integrations
- **atomic-note**: Code sharing and collaboration platform integration
- **a-comic**: Additional utility functions and helpers
- **cors**: Cross-origin resource sharing for web APIs
- **deasync**: Synchronous operation utilities