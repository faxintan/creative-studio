## Purpose

Provide a local browser-based AiChat experience that exchanges messages with the user's local TraeCode CLI runtime while keeping interaction responsive and recoverable.

## ADDED Requirements

### Requirement: Local chat surface
The system SHALL provide a browser-accessible AiChat page for a single local user.

#### Scenario: Open local chat page
- **WHEN** the user opens the local AiChat page
- **THEN** the system SHALL display the current chat transcript, a message composer, and the connection state for the local bridge

#### Scenario: Local-only access
- **WHEN** the AiChat service starts with its default configuration
- **THEN** the system SHALL bind user-facing HTTP and message endpoints to localhost only

### Requirement: Message submission
The system SHALL allow the user to submit a text prompt from the browser and route it to the local TraeCode CLI runtime through the local bridge.

#### Scenario: Send prompt
- **WHEN** the user submits a non-empty prompt
- **THEN** the system SHALL append the prompt to the transcript as a user message
- **AND** the system SHALL start an assistant response for that prompt

#### Scenario: Reject empty prompt
- **WHEN** the user submits an empty or whitespace-only prompt
- **THEN** the system SHALL not send a message to the local bridge
- **AND** the system SHALL keep the composer available for input

### Requirement: Streaming assistant responses
The system SHALL render assistant responses incrementally as output arrives from the local TraeCode CLI runtime.

#### Scenario: Receive streamed output
- **WHEN** the local bridge receives partial assistant output
- **THEN** the system SHALL append that output to the active assistant message without waiting for the final response

#### Scenario: Complete streamed response
- **WHEN** the local bridge reports that the assistant response is complete
- **THEN** the system SHALL mark the active assistant message as complete
- **AND** the system SHALL return the composer to an idle state

### Requirement: Conversation continuity
The system SHALL preserve continuity for follow-up prompts within the active local chat session.

#### Scenario: Continue active session
- **GIVEN** the user has already sent a prompt in the active local chat session
- **WHEN** the user sends a follow-up prompt
- **THEN** the system SHALL route the prompt with enough session context for the local TraeCode CLI runtime to continue the conversation

#### Scenario: Reload active browser session
- **GIVEN** a local chat session exists in the browser
- **WHEN** the user reloads the AiChat page
- **THEN** the system SHALL restore the visible transcript for that browser session

### Requirement: In-flight cancellation
The system SHALL allow the user to cancel an in-flight assistant response.

#### Scenario: Cancel running response
- **WHEN** the user cancels while an assistant response is running
- **THEN** the system SHALL stop forwarding additional output for that response
- **AND** the system SHALL mark the assistant message as canceled
- **AND** the system SHALL return the composer to an idle state

### Requirement: Error feedback and recovery
The system SHALL show actionable feedback when the local bridge or TraeCode CLI runtime cannot complete a request.

#### Scenario: Bridge unavailable
- **WHEN** the browser cannot connect to the local bridge
- **THEN** the system SHALL show a disconnected state
- **AND** the system SHALL prevent message submission until the connection is restored

#### Scenario: Runtime request fails
- **WHEN** the local TraeCode CLI runtime reports a request failure
- **THEN** the system SHALL mark the active assistant message as failed
- **AND** the system SHALL show the failure reason when one is available
- **AND** the system SHALL allow the user to retry without losing the transcript
