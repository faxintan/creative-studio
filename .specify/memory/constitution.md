<!--
Sync Impact Report
- Version change: template → 1.0.0
- Modified principles: template placeholders → five project-specific principles
- Added sections: Technology and Architecture Constraints; Development Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: ratification date is unknown and must be confirmed before final adoption
-->

# Creative Studio Constitution

## Core Principles

### I. Specification-Driven Delivery
Every user-visible feature MUST begin with a reviewed specification that states user
value, scope, scenarios, functional requirements, edge cases, and measurable success
criteria. Technical design MUST be recorded in `plan.md`, and executable work MUST be
tracked in `tasks.md` before implementation begins. The implementation MUST be checked
against the specification before the feature is considered complete.

### II. FSD Architecture and Boundary Ownership
The frontend MUST follow Feature-Sliced Design (FSD) boundaries: `shared`, `entities`,
`features`, `widgets`, `pages`, and `app`, using only the layers required by the
feature. Dependencies MUST flow from higher layers to lower layers and MUST NOT form
cycles. A lower layer MUST NOT import from a higher layer. Each module MUST expose a
small public API and MUST keep UI, domain behavior, data access, and application
composition in their appropriate ownership boundaries.

### III. Type-Safe Full-Stack Contracts
The project MUST use TypeScript across the Node.js backend and React frontend. Shared
request, response, domain, and error contracts MUST have one authoritative definition
or a generated representation. API handlers MUST validate external input at runtime;
compile-time types alone are insufficient at trust boundaries. Breaking contract
changes MUST be explicitly versioned or migrated with all affected consumers updated.

### IV. Verification and Observable Behavior
Every functional change MUST include verification appropriate to its risk. New domain
logic MUST have focused unit coverage; API or shared-contract changes MUST have
integration or contract coverage; critical user journeys MUST have an end-to-end or
equivalent acceptance check. Errors MUST be handled through the project's common
mechanism, logged with actionable context, and exposed to users with stable English
messages without leaking secrets or internal implementation details.

### V. Minimal Complexity and Secure Defaults
Implementations MUST choose the smallest design that satisfies the approved
requirements and MUST document material complexity or rejected simpler alternatives.
Authentication, authorization, input validation, output encoding, secret handling,
dependency updates, and failure behavior MUST use secure defaults. No feature MAY
introduce a new abstraction, dependency, or service boundary without a concrete
maintenance or correctness benefit.

## Technology and Architecture Constraints

- The application MUST use Node.js for backend/runtime services and React for the
  frontend.
- TypeScript MUST be the default language for application code, configuration that
  supports it, and shared contracts.
- Frontend code MUST respect FSD layer ownership. Cross-feature imports MUST go through
  explicit public APIs rather than reaching into another slice's internal files.
- Backend modules MUST separate transport concerns, application/use-case behavior,
  domain logic, and infrastructure concerns. The exact framework and persistence
  technology MUST be selected in the feature plan.
- User-facing system and error messages MUST be written in English. Domain terminology
  MUST remain consistent across UI, API contracts, and specifications.
- The first implementation MUST remain as simple as the current deployment and
  operating model require. Distributed infrastructure is out of scope unless a feature
  specification demonstrates the need.

## Development Workflow and Quality Gates

1. The project constitution MUST be established before the first feature specification.
2. Each feature MUST follow `specify → clarify → plan → tasks → implement →
   converge`, with `checklist` and `analyze` used as quality gates for non-trivial
   changes.
3. The specification MUST be reviewed before planning, and the plan MUST be reviewed
   before task generation.
4. Tasks MUST identify concrete file paths, dependencies, and the user story they
   support. Tasks for independent work MAY be marked parallel.
5. Implementation MUST preserve the approved FSD boundaries and API contracts. Any
   deviation MUST be recorded in the plan or an amendment to the specification.
6. A feature is complete only when its tasks, acceptance scenarios, applicable
   verification, and constitution checks are satisfied.
7. Changes to shared components, shared contracts, authentication, authorization,
   persistence, or error handling MUST receive focused review for compatibility and
   security impact.

## Governance

This constitution is authoritative for project structure, delivery workflow, and
quality expectations. A feature specification or implementation plan MUST NOT weaken a
MUST-level rule without an explicit constitution amendment.

Amendments MUST describe the affected principles, rationale, migration impact, and
follow-up work. The version follows semantic versioning: MAJOR for incompatible rule
changes, MINOR for new or materially expanded rules, and PATCH for clarifications that
do not change obligations. Every implementation review MUST check the applicable
principles and record unresolved violations as explicit follow-up tasks.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): confirm initial adoption date | **Last Amended**: 2026-09-18
