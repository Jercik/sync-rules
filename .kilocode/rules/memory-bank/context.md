# Project Context, Design Philosophy & Future Directions: sync-rules

## Current Status

The `sync-rules` project is feature-complete with robust exclusion pattern functionality. Core functionality is stable and working.

## Design Philosophy

1.  **Simplicity Over Features**: Prioritizing ease of use over advanced configuration options.
2.  **VS Code Integration**: Using VS Code as the primary conflict resolution tool.
3.  **Conservative File Handling**: Never delete files from the target directory; always preserve user work.
4.  **Native TypeScript**: Leveraging Node.js 23.6+ for native TypeScript execution, enabling a zero build step.

## Key Design Drivers

The development of `sync-rules` has been shaped by several key insights that directly influence its functionality and user experience:

- **Robust Input Validation**: Early and thorough validation of source/destination directories and user inputs prevents common errors.
- **Actionable Error Messaging**: Providing clear, specific error messages guides users in resolving issues.
- **Safe File Operations**: The tool is designed to be non-destructive, for instance, by skipping symbolic links to avoid unintended side effects and by never deleting target files.
- **Effective Default Exclusions**: Sensible default exclusions (like `node_modules`, `.git`) streamline common use cases.

## Performance Considerations

- **Efficiency**: The current implementation is optimized for typical rule file sizes and structures, ensuring responsive performance for most scenarios.

## Future Directions & Scope

This section outlines potential areas for future enhancements and clarifies aspects that are intentionally outside the current scope of the project.

### Potential Enhancements

The following are areas where `sync-rules` could be extended in the future. Community contributions and suggestions are welcome:

- **Enhanced User Experience**: Ideas include more detailed summary reports after synchronization.
- **Configuration Flexibility**: Exploring an optional configuration file for project-specific default patterns and settings.
- **Automated Testing**: Developing a comprehensive test suite to ensure ongoing reliability and facilitate contributions.

### Design Decisions (Not Planned)

- **Multiple Merge Tools**: VS Code strategy works well, no need for alternatives.
- **File Deletion**: Preserving target files is a core safety feature.
- **Complex Configuration**: Simplicity is a key design goal.
