;; AeroSecure Traceability Log Contract
;; Clarity v2 (latest syntax as of 2025)
;; Records immutable supply chain events for aerospace parts, including manufacturing,
;; shipping, inspections, and ownership transfers. Integrates with Parts Registry Contract.
;; Supports access controls, event logging, and querying for transparency.

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-PART-ID u201)
(define-constant ERR-PAUSED u202)
(define-constant ERR-ZERO-ADDRESS u203)
(define-constant ERR-INVALID-EVENT-TYPE u204)
(define-constant ERR-INVALID-METADATA u205)
(define-constant ERR-NO-PART-OWNER u206)
(define-constant ERR-MAX-EVENTS-REACHED u207)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MAX-EVENTS-PER-PART u1000) ;; Prevent unbounded growth
(define-constant EVENT-MANUFACTURED u0)
(define-constant EVENT-SHIPPED u1)
(define-constant EVENT-INSPECTED u2)
(define-constant EVENT-INSTALLED u3)
(define-constant EVENT-TRANSFERRED u4)

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)

;; Maps
(define-map authorized-loggers principal bool) ;; Entities allowed to log events
(define-map event-log uint
  {
    event-count: uint, ;; Number of events for this part
    events: (list 1000
      {
        event-type: uint,       ;; Type of event (manufactured, shipped, etc.)
        timestamp: uint,        ;; Block height
        actor: principal,       ;; Who performed the action
        metadata: (buff 256),   ;; Additional details (e.g., location, cert hash)
        verified: bool          ;; Whether verified by oracle or admin
      }
    )
  }
)
(define-map part-ownership-log uint
  {
    current-owner: principal, ;; Current owner of the part
    transfer-count: uint,     ;; Number of ownership transfers
    transfers: (list 1000
      {
        from: principal,
        to: principal,
        timestamp: uint,
        metadata: (buff 256)
      }
    )
  }
)

;; Private helpers

;; Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Check if caller is authorized logger
(define-private (is-authorized-logger (caller principal))
  (default-to false (map-get? authorized-loggers caller))
)

;; Ensure contract is not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Validate event type
(define-private (is-valid-event-type (event-type uint))
  (or (is-eq event-type EVENT-MANUFACTURED)
      (is-eq event-type EVENT-SHIPPED)
      (is-eq event-type EVENT-INSPECTED)
      (is-eq event-type EVENT-INSTALLED)
      (is-eq event-type EVENT-TRANSFERRED))
)

;; Validate metadata
(define-private (validate-metadata (metadata (buff 256)))
  (> (len metadata) u0)
)

;; Admin functions

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (print {event: "admin-transferred", new-admin: new-admin})
    (ok true)
  )
)

;; Pause/unpause contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (print {event: "contract-paused", paused: pause})
    (ok pause)
  )
)

;; Add authorized logger
(define-public (add-logger (logger principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq logger 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set authorized-loggers logger true)
    (print {event: "logger-added", logger: logger})
    (ok true)
  )
)

;; Remove authorized logger
(define-public (remove-logger (logger principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (map-delete authorized-loggers logger)
    (print {event: "logger-removed", logger: logger})
    (ok true)
  )
)

;; Core functions

;; Log a supply chain event
(define-public (log-event (part-id uint) (event-type uint) (metadata (buff 256)))
  (let
    (
      (current-log (default-to {event-count: u0, events: (list )} (map-get? event-log part-id)))
      (event-count (get event-count current-log))
      (current-events (get events current-log))
    )
    (asserts! (is-authorized-logger tx-sender) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (asserts! (is-valid-event-type event-type) (err ERR-INVALID-EVENT-TYPE))
    (asserts! (validate-metadata metadata) (err ERR-INVALID-METADATA))
    (asserts! (< event-count MAX-EVENTS-PER-PART) (err ERR-MAX-EVENTS-REACHED))
    ;; Assuming part-id exists (integrates with Parts Registry)
    (map-set event-log part-id
      {
        event-count: (+ event-count u1),
        events: (unwrap! (as-max-len? (append current-events
          {
            event-type: event-type,
            timestamp: block-height,
            actor: tx-sender,
            metadata: metadata,
            verified: false
          }) u1000) (err ERR-MAX-EVENTS-REACHED))
      }
    )
    (print {event: "supply-chain-event", part-id: part-id, event-type: event-type, actor: tx-sender})
    (ok true)
  )
)

;; Log ownership transfer (called by Parts Registry or authorized parties)
(define-public (log-transfer (part-id uint) (from principal) (to principal) (metadata (buff 256)))
  (let
    (
      (current-log (default-to {current-owner: 'SP000000000000000000002Q6VF78, transfer-count: u0, transfers: (list )} (map-get? part-ownership-log part-id)))
      (transfer-count (get transfer-count current-log))
      (current-transfers (get transfers current-log))
    )
    (asserts! (or (is-admin) (is-authorized-logger tx-sender)) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (asserts! (not (is-eq to 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-metadata metadata) (err ERR-INVALID-METADATA))
    (asserts! (< transfer-count MAX-EVENTS-PER-PART) (err ERR-MAX-EVENTS-REACHED))
    (map-set part-ownership-log part-id
      {
        current-owner: to,
        transfer-count: (+ transfer-count u1),
        transfers: (unwrap! (as-max-len? (append current-transfers
          {
            from: from,
            to: to,
            timestamp: block-height,
            metadata: metadata
          }) u1000) (err ERR-MAX-EVENTS-REACHED))
      }
    )
    (try! (log-event part-id EVENT-TRANSFERRED metadata))
    (print {event: "ownership-transferred", part-id: part-id, from: from, to: to})
    (ok true)
  )
)

;; Verify an event (by admin or oracle)
(define-public (verify-event (part-id uint) (event-index uint))
  (let
    (
      (current-log (unwrap! (map-get? event-log part-id) (err ERR-INVALID-PART-ID)))
      (event-count (get event-count current-log))
      (current-events (get events current-log))
    )
    (asserts! (or (is-admin) (is-authorized-logger tx-sender)) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (asserts! (< event-index event-count) (err ERR-INVALID-PART-ID))
    (let
      (
        (target-event (unwrap-panic (element-at current-events event-index)))
        (updated-events (unwrap-panic (as-max-len? (replace-at current-events event-index
          (merge target-event {verified: true})) u1000)))
      )
      (map-set event-log part-id
        {
          event-count: event-count,
          events: updated-events
        }
      )
      (print {event: "event-verified", part-id: part-id, event-index: event-index})
      (ok true)
    )
  )
)

;; Read-only functions

;; Get event log for a part
(define-read-only (get-event-log (part-id uint))
  (ok (map-get? event-log part-id))
)

;; Get ownership log for a part
(define-read-only (get-ownership-log (part-id uint))
  (ok (map-get? part-ownership-log part-id))
)

;; Get specific event
(define-read-only (get-event (part-id uint) (event-index uint))
  (match (map-get? event-log part-id)
    some-log
      (let ((events (get events some-log)))
        (match (element-at events event-index)
          some-event (ok some-event)
          none (err ERR-INVALID-PART-ID)))
    none (err ERR-INVALID-PART-ID)
  )
)

;; Get current owner
(define-read-only (get-current-owner (part-id uint))
  (match (map-get? part-ownership-log part-id)
    some-log (ok (get current-owner some-log))
    none (err ERR-INVALID-PART-ID)
  )
)

;; Check if logger is authorized
(define-read-only (is-logger-authorized (logger principal))
  (ok (default-to false (map-get? authorized-loggers logger)))
)

;; Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)