# Pull Request Template

## Summary
- **Purpose of this PR**: [Brief description of what this PR accomplishes]
- **Related instruction folder**: `dev-status/YYYY-MM-DD-description/` (if applicable)
- **Related Issue**: Closes #[issue-number] (if applicable)

## Changes
<!-- List the main changes made in this PR -->
- [ ] [Change 1]
- [ ] [Change 2]
- [ ] [Change 3]

## Type of Change
<!-- Check the relevant option -->
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🏗️ Infrastructure/CI changes
- [ ] 🧹 Code cleanup/refactoring
- [ ] 🔧 Configuration changes

## NEVER/ALWAYS Rules Compliance
<!-- Verify all NEVER/ALWAYS rules from CLAUDE.md are followed -->
- [ ] **No console.log statements** (or RELEASE mode compatible)
- [ ] **No competitor brand names** in public content
- [ ] **All 'any' types explained** with justification comments
- [ ] **Error handling implemented** for all async operations
- [ ] **JSDoc comments added** for public APIs
- [ ] **i18n keys used** for user-facing strings

## Testing
<!-- Describe the testing performed -->
- [ ] **Unit tests added/updated** and passing
- [ ] **Integration tests** passing (if applicable)
- [ ] **UI Flows tests** added/updated (if applicable)
- [ ] **Manual testing completed**
- [ ] **Performance impact assessed** (if applicable)

## Quality Checks
<!-- Verify these have been completed -->
- [ ] **CI green**: All GitHub Actions workflows passing
- [ ] **Instruction folder validation**: Contains required files (if applicable)
- [ ] **Brand check passed**: No competitor names in tracked files
- [ ] **Rules check passed**: Development mode compliance verified
- [ ] **TypeScript**: No compilation errors
- [ ] **Linting**: ESLint passes with no warnings
- [ ] **Coverage**: Meets phase requirements (Phase 1: 70%)

## Documentation
<!-- Ensure documentation is updated -->
- [ ] **Code documentation** updated (JSDoc, inline comments)
- [ ] **User documentation** updated (if user-facing changes)
- [ ] **API documentation** updated (if API changes)
- [ ] **Examples updated** in docs/examples/ (if applicable)
- [ ] **Video recordings** created (if significant UI changes)

## Breaking Changes
<!-- If this is a breaking change, describe the impact -->
- [ ] **No breaking changes**
- [ ] **Breaking changes documented** with migration guide
- [ ] **Backward compatibility** maintained where possible

## Phase Compliance
<!-- Verify phase-specific requirements -->
- [ ] **Phase requirements met**: [Current Phase] compliance verified
- [ ] **Coverage target achieved**: [X]% coverage (target varies by phase)
- [ ] **Performance benchmarks**: Meet phase-specific performance targets
- [ ] **Recording requirements**: Video/GIF created for new features

## Deployment Notes
<!-- Any special instructions for deployment -->
- [ ] **No special deployment steps required**
- [ ] **Database migrations needed**: [Describe if applicable]
- [ ] **Configuration changes required**: [Describe if applicable]
- [ ] **Environment variables added/changed**: [List if applicable]

## Reviewer Checklist
<!-- For reviewers to verify -->
- [ ] **Code review completed**: Logic, style, and architecture reviewed
- [ ] **Testing verified**: Tests are comprehensive and passing
- [ ] **Documentation reviewed**: All docs are accurate and complete
- [ ] **CLAUDE.md compliance**: All rules verified
- [ ] **Performance acceptable**: No significant performance regressions
- [ ] **Security reviewed**: No security concerns identified

## Additional Notes
<!-- Any additional context, dependencies, or considerations -->

---

**Review Guidelines**:
- Ensure all checkboxes are completed before requesting review
- Link to relevant instruction folder in dev-status/ if applicable
- Include screenshots/GIFs for UI changes
- Verify CLAUDE.md NEVER/ALWAYS rules compliance
- Test thoroughly in both development and production scenarios