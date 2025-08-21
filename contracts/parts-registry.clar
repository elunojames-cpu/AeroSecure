;; AeroSecure Parts Registry Contract
;; Clarity v2 (assuming latest syntax as of 2025)
;; Manages registration and lifecycle of certified aerospace parts as unique NFTs.
;; Supports minting by authorized manufacturers, metadata storage, status updates,
;; transfers for supply chain traceability, and access controls for security.

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-REGISTERED u101)
(define-constant ERR-INVALID-PART-ID u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-ZERO-ADDRESS u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-NOT-OWNER u106)
(define-constant ERR-INVALID-METADATA u107)
(define-constant ERR-MAX-ID-REACHED u108)
(define-constant ERR-NOT-AUTHORIZED-MINTER u109)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant MAX-PART-ID u100000000) ;; Arbitrary max to prevent overflow issues
(define-constant STATUS-ACTIVE u0)
(define-constant STATUS_RETIRED u1)
(define-constant STATUS_RECALLED u2)
(define-constant STATUS_INSTALLED u3)

;; Non-fungible token definition for unique parts
(define-non-fungible-token aerospace-part uint)

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var last-part-id uint u0)

;; Maps
(define-map authorized-minters principal bool) ;; Manufacturers authorized to mint parts
(define-map part-metadata uint
  {
    serial-number: (buff 32), ;; Unique serial number
    manufacturer: principal,  ;; Manufacturer principal
    certification: (buff 64), ;; Certification hash or details
    description: (string-ascii 256), ;; Part description
    manufacture-date: uint,   ;; Block height or timestamp
    status: uint              ;; Current status (active, retired, etc.)
  }
)
(define-map part-owners uint principal) ;; Owner of each part NFT

;; Private helpers

;; Check if caller is admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Check if caller is authorized minter
(define-private (is-authorized-minter (caller principal))
  (default-to false (map-get? authorized-minters caller))
)

;; Ensure contract is not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Validate status code
(define-private (is-valid-status (status uint))
  (or (is-eq status STATUS-ACTIVE)
      (is-eq status STATUS_RETIRED)
      (is-eq status STATUS_RECALLED)
      (is-eq status STATUS_INSTALLED))
)

;; Validate metadata inputs
(define-private (validate-metadata (serial (buff 32)) (cert (buff 64)) (desc (string-ascii 256)))
  (and (> (len serial) u0)
       (> (len cert) u0)
       (> (len desc) u0))
)

;; Admin functions

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS)) ;; Zero address check
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Add authorized minter
(define-public (add-minter (minter principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq minter 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set authorized-minters minter true)
    (print {event: "minter-added", minter: minter})
    (ok true)
  )
)

;; Remove authorized minter
(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (map-delete authorized-minters minter)
    (print {event: "minter-removed", minter: minter})
    (ok true)
  )
)

;; Core functions

;; Mint a new part (by authorized minter)
(define-public (mint-part (serial-number (buff 32)) (certification (buff 64)) (description (string-ascii 256)))
  (let
    (
      (new-id (+ (var-get last-part-id) u1))
      (caller tx-sender)
    )
    (asserts! (is-authorized-minter caller) (err ERR-NOT-AUTHORIZED-MINTER))
    (ensure-not-paused)
    (asserts! (<= new-id MAX-PART-ID) (err ERR-MAX-ID-REACHED))
    (asserts! (validate-metadata serial-number certification description) (err ERR-INVALID-METADATA))
    ;; Check if serial is unique (simplified: assume IDs are unique, but in real could hash serial and check map)
    (asserts! (is-none (nft-get-owner? aerospace-part new-id)) (err ERR-ALREADY-REGISTERED))
    ;; Mint NFT
    (try! (nft-mint? aerospace-part new-id caller))
    ;; Set metadata
    (map-set part-metadata new-id
      {
        serial-number: serial-number,
        manufacturer: caller,
        certification: certification,
        description: description,
        manufacture-date: block-height,
        status: STATUS-ACTIVE
      }
    )
    ;; Set owner
    (map-set part-owners new-id caller)
    (var-set last-part-id new-id)
    (print {event: "part-minted", part-id: new-id, manufacturer: caller, serial: serial-number})
    (ok new-id)
  )
)

;; Transfer part ownership (for supply chain)
(define-public (transfer-part (part-id uint) (recipient principal))
  (let
    (
      (current-owner (unwrap! (nft-get-owner? aerospace-part part-id) (err ERR-INVALID-PART-ID)))
    )
    (ensure-not-paused)
    (asserts! (is-eq tx-sender current-owner) (err ERR-NOT-OWNER))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (try! (nft-transfer? aerospace-part part-id tx-sender recipient))
    (map-set part-owners part-id recipient)
    (print {event: "part-transferred", part-id: part-id, from: tx-sender, to: recipient})
    (ok true)
  )
)

;; Update part status (by owner or admin)
(define-public (update-status (part-id uint) (new-status uint))
  (let
    (
      (current-owner (unwrap! (nft-get-owner? aerospace-part part-id) (err ERR-INVALID-PART-ID)))
      (metadata (unwrap! (map-get? part-metadata part-id) (err ERR-INVALID-PART-ID)))
    )
    (ensure-not-paused)
    (asserts! (or (is-eq tx-sender current-owner) (is-admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-status new-status) (err ERR-INVALID-STATUS))
    (map-set part-metadata part-id (merge metadata {status: new-status}))
    (print {event: "status-updated", part-id: part-id, new-status: new-status})
    (ok true)
  )
)

;; Burn/retire a part (by owner)
(define-public (burn-part (part-id uint))
  (let
    (
      (current-owner (unwrap! (nft-get-owner? aerospace-part part-id) (err ERR-INVALID-PART-ID)))
    )
    (ensure-not-paused)
    (asserts! (is-eq tx-sender current-owner) (err ERR-NOT-OWNER))
    (try! (nft-burn? aerospace-part part-id tx-sender))
    (map-delete part-owners part-id)
    ;; Update status to retired if not already
    (match (map-get? part-metadata part-id)
      some-metadata
        (map-set part-metadata part-id (merge some-metadata {status: STATUS_RETIRED}))
      none ;; Should not happen
    )
    (print {event: "part-burned", part-id: part-id})
    (ok true)
  )
)

;; Read-only functions

;; Get part metadata
(define-read-only (get-part-metadata (part-id uint))
  (ok (map-get? part-metadata part-id))
)

;; Get part owner
(define-read-only (get-part-owner (part-id uint))
  (ok (map-get? part-owners part-id))
)

;; Get last part ID
(define-read-only (get-last-part-id)
  (ok (var-get last-part-id))
)

;; Check if minter is authorized
(define-read-only (is-minter-authorized (minter principal))
  (ok (default-to false (map-get? authorized-minters minter)))
)

;; Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Get NFT owner (wrapper)
(define-read-only (get-nft-owner (part-id uint))
  (nft-get-owner? aerospace-part part-id)
)