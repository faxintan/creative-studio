# Commit Conventions

Use Conventional Commit subjects and precise English. These conventions apply to commits created after their introduction; do not rewrite existing history to retrofit them.

## Application scope is mandatory

Any commit that changes application requirements, proposals, designs, specifications, tasks, planning configuration, documentation, or archives MUST include a scope identifying the affected application. This includes documentation-only changes under `apps/<app>/` and application design changes described elsewhere in the repository.

Use this subject format for application-related commits:

```text
<type>(<scope>): <description>
```

Use `!` immediately before the colon for a breaking contract change, and explain the impact and migration in the body or a `BREAKING CHANGE:` footer. Keep the subject concise and describe the planning change accurately; a specification commit does not claim that application code has shipped.

| Changed content | Required scope | Example |
| --- | --- | --- |
| Chat application | `chat` | `feat(chat): define streaming response behavior` |
| Note application | `note` | `fix(note): correct note ownership requirements` |
| A new application | Its directory ID under `apps/` | `chore(calendar): initialize planning store` |
| An inseparable change affecting multiple applications | `apps`, with an `Apps:` body line | `docs(apps): standardize application planning guidance` |
| Shared repository rules or tooling only | `repo` is recommended | `docs(repo): clarify store registration` |

The scope is the application directory ID, not its store ID, change ID, or a generic `spec` or `design` label. For example, a chat design commit uses `chat`, not `creative-studio-chat` or `design`. A repository-only commit may omit scope under Conventional Commits, but application-related commits may not.

## Types and examples

Choose the type that describes the change, independently of its application scope:

- `feat`: introduce or extend specified application behavior.
- `fix`: correct a requirement or contract that specifies incorrect behavior.
- `docs`: clarify documentation, scenarios, or design explanations without changing the intended behavior contract.
- `refactor`: reorganize planning artifacts without changing the behavior contract.
- `chore`: maintain store configuration or record completed archival.

```text
feat(chat): define streaming response behavior
fix(note): correct note ownership requirements
docs(chat): clarify stream cancellation scenarios
refactor(note): consolidate application requirements
chore(chat): archive add-streaming
```

For a commit associated with an existing OpenSpec change, reference its store and change ID in the body:

```text
feat(chat): define streaming response behavior

Change: creative-studio-chat/add-streaming
```

Do not create a product change solely to attach an ID to repository housekeeping.

## Multiple applications

Split independent application changes into separate commits, each with its own application scope. For a change that must remain atomic across applications, use scope `apps` and explicitly list all affected application IDs in an `Apps:` body line. Reference each existing application change when applicable.

```text
feat(apps): align shared session expiration contracts

Apps: chat, note
Change: creative-studio-chat/align-session-expiration
Change: creative-studio-note/align-session-expiration
```

An application commit that also updates the root index or shared workflow still requires the application scope. Do not use `repo` to hide application changes. Apply the same convention to the final squash commit when squash-merging a PR.

## Invalid application commit subjects

- `feat: define chat streaming behavior` omits the required scope.
- `docs: clarify note acceptance scenarios` omits scope even though the change is documentation-only.
- `feat(note): define chat streaming behavior` names the wrong application.
- `chore(repo): archive chat add-streaming` disguises an application archive as repository-only work.
- `feat(apps): align session contracts` is incomplete for a multi-application commit unless its body lists the affected applications.

These are repository contribution and review rules. This repository does not currently install a commit-msg hook or CI validator to enforce them automatically.
