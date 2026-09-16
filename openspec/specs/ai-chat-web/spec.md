# ai-chat-web Specification

## Purpose

Provide a local browser-based AiChat experience that exchanges messages with the user's local TraeCode CLI runtime while keeping interaction responsive and recoverable.

## Requirements

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

### Requirement: Runtime model catalog and load visibility
The system SHALL let the user inspect and refresh the models reported by the local TraeCode CLI, and SHALL present each model's reported load without manufacturing unavailable load data.

#### Scenario: Load available models
- **WHEN** the local bridge obtains the model catalog from the local TraeCode CLI
- **THEN** the system SHALL make the reported models available in the chat model selector
- **AND** the system SHALL display the latest reported load for each model that includes load data

#### Scenario: Model has no reported load
- **WHEN** a catalog model does not include load data
- **THEN** the system SHALL indicate that the model's load is unavailable
- **AND** the system SHALL NOT present the missing load as zero

#### Scenario: Reported load exceeds one hundred percent
- **WHEN** the local TraeCode CLI reports a model load greater than 100 percent
- **THEN** the system SHALL preserve and display the reported value
- **AND** the system SHALL NOT clamp the value to 100 percent

#### Scenario: Refresh model catalog
- **WHEN** the user requests a model catalog refresh
- **THEN** the system SHALL request current model data from the local TraeCode CLI
- **AND** the system SHALL update the selector with the resulting catalog

#### Scenario: Model catalog cannot be loaded
- **WHEN** the local bridge cannot obtain a usable model catalog
- **THEN** the system SHALL show that model availability cannot be determined
- **AND** the system SHALL provide an actionable failure reason when one is available

### Requirement: Startup model bootstrap and recovery
The system SHALL initialize the model catalog as part of establishing the browser-to-bridge connection and SHALL expose a recoverable state when catalog loading is slow, rejected, or unavailable.

#### Scenario: Bootstrap catalog after connection
- **WHEN** the browser establishes a connection to the local bridge
- **THEN** the local bridge SHALL push the current model catalog without requiring a separate user action
- **AND** the browser SHALL populate the model selector from that catalog

#### Scenario: Catalog command is rejected by an incompatible bridge
- **WHEN** the browser receives a command rejection while the model catalog is loading
- **THEN** the browser SHALL stop showing an indefinite loading state
- **AND** the browser SHALL indicate that the Bridge must be restarted or upgraded
- **AND** the browser SHALL provide a retry action

#### Scenario: Catalog loading is slow
- **WHEN** model discovery takes longer than the normal startup wait
- **THEN** the browser SHALL continue to show a loading state with a bounded recovery path
- **AND** the browser SHALL eventually show an actionable catalog failure instead of waiting indefinitely

### Requirement: Local startup port reuse
The one-click local development startup SHALL ensure that the current Bridge can bind its configured port even when a previous instance is already occupying that port.

#### Scenario: Previous Bridge occupies the configured port
- **WHEN** one-click startup detects an existing process listening on the configured Bridge port
- **THEN** startup SHALL terminate that previous Bridge process
- **AND** startup SHALL launch the current Bridge on the configured port
- **AND** startup SHALL continue launching the web server without an `EADDRINUSE` terminal error

#### Scenario: Port occupant is not the previous Bridge
- **WHEN** one-click startup detects a process on the configured Bridge port that is not the project Bridge
- **THEN** startup SHALL not silently terminate the unrelated process
- **AND** startup SHALL show an actionable port-conflict error
- **AND** startup SHALL not emit an unhandled server exception

### Requirement: Per-message model selection
The system SHALL allow the user to select a catalog model for future prompts while preserving the active conversation, and SHALL bind each submitted prompt to the model selected at submission time.

#### Scenario: Change model before the next prompt
- **GIVEN** an active local chat session exists
- **WHEN** the user selects a different model without submitting a prompt
- **THEN** the system SHALL preserve the active conversation and visible transcript
- **AND** the new selection SHALL apply beginning with the next submitted prompt

#### Scenario: Submit prompt with selected model
- **WHEN** the user submits a non-empty prompt with a model selected
- **THEN** the system SHALL bind that prompt and its assistant response to the selected model
- **AND** the local bridge SHALL route the prompt to the local TraeCode CLI using that model

#### Scenario: Change selection during an in-flight response
- **GIVEN** an assistant response is submitting, queued, or streaming
- **WHEN** the user changes the selected model
- **THEN** the in-flight response SHALL remain bound to the model selected when its prompt was submitted
- **AND** the new selection SHALL apply beginning with the next submitted prompt

#### Scenario: Continue conversation after changing model
- **GIVEN** the user changes the selected model in an active local chat session
- **WHEN** the user submits a follow-up prompt
- **THEN** the system SHALL continue the existing conversation context
- **AND** the system SHALL use the newly selected model for the follow-up response

#### Scenario: Attribute assistant response to model
- **WHEN** an assistant response is accepted for processing
- **THEN** the transcript SHALL identify the model associated with that response
- **AND** the attribution SHALL remain available after the response reaches a terminal state or the browser reloads

#### Scenario: Selected model is no longer available
- **WHEN** the user submits a prompt whose selected model is no longer available to the local TraeCode CLI
- **THEN** the system SHALL NOT silently switch to another model
- **AND** the system SHALL show an actionable failure
- **AND** the system SHALL preserve the prompt and transcript for retry

### Requirement: Explicit request lifecycle and capacity queue feedback
The system SHALL distinguish submitting, queued, streaming, completed, canceled, and failed request states, and SHALL show a queued state only when the local TraeCode CLI explicitly reports that the accepted request is waiting for model capacity.

#### Scenario: Submit request before runtime output
- **WHEN** the local bridge accepts a prompt and no runtime queue or output event has arrived
- **THEN** the system SHALL show the assistant response as submitting

#### Scenario: Runtime reports capacity queue
- **WHEN** the local TraeCode CLI explicitly reports that an accepted request is waiting for model capacity
- **THEN** the system SHALL mark the assistant response as queued
- **AND** the system SHALL keep the queued response associated with its submitted prompt and selected model

#### Scenario: Runtime begins output after queueing
- **GIVEN** an assistant response is queued
- **WHEN** the local TraeCode CLI emits assistant output
- **THEN** the system SHALL change the response state to streaming
- **AND** the system SHALL append the output to that response

#### Scenario: No explicit queue signal
- **WHEN** a submitted request has not received an explicit capacity-queue signal from the local TraeCode CLI
- **THEN** the system SHALL NOT mark the response as queued based on model load, elapsed time, or inferred demand

#### Scenario: Queue details are not reported
- **WHEN** the local TraeCode CLI reports that a request is queued without a reliable queue position or estimated wait
- **THEN** the system SHALL show only that the request is waiting for capacity
- **AND** the system SHALL NOT invent a queue position or estimated wait

#### Scenario: Cancel queued response
- **WHEN** the user cancels an assistant response while it is queued
- **THEN** the system SHALL cancel that response through the local bridge
- **AND** the system SHALL mark the assistant message as canceled
- **AND** the system SHALL ignore subsequent runtime output for the canceled response
