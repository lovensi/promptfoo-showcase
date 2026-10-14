## [Unreleased]

### Added
- Tasks can be marked as done (#80)
- Tasks can have due dates (#81)

### Fixed
- Task list is now sorted by creation time instead of a random order (#82)

### Removed
- **BREAKING:** The "urgent" priority was removed; use "high" instead (#83)

### Security
- Task titles are sanitized to prevent stored cross-site scripting (XSS) (#84)

