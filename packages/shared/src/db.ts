
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_days": {
                  Row: {
                    "day": string,"user_id": string
                  }
                  Insert: {
                    "day": string,"user_id": string
                  }
                  Update: {
                    "day"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"admins": {
                  Row: {
                    "campus_id": string | null,"created_at": string | null,"invited_by": string | null,"role": Database["public"]['Enums']["admin_role"],"user_id": string
                  }
                  Insert: {
                    "campus_id"?: string | null,"created_at"?: string | null,"invited_by"?: string | null,"role": Database["public"]['Enums']["admin_role"],"user_id": string
                  }
                  Update: {
                    "campus_id"?: string | null,"created_at"?: string | null,"invited_by"?: string | null,"role"?: Database["public"]['Enums']["admin_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admins_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admins_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"age_blocks": {
                  Row: {
                    "created_at": string | null,"email_hash": string
                  }
                  Insert: {
                    "created_at"?: string | null,"email_hash": string
                  }
                  Update: {
                    "created_at"?: string | null,"email_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"announcements": {
                  Row: {
                    "body": string | null,"campus_id": string | null,"created_at": string | null,"created_by": string | null,"id": string,"pinned_until": string | null,"send_push": boolean | null,"sent_at": string | null,"title": string | null,"type": string | null
                  }
                  Insert: {
                    "body"?: string | null,"campus_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"pinned_until"?: string | null,"send_push"?: boolean | null,"sent_at"?: string | null,"title"?: string | null,"type"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"campus_id"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"id"?: string,"pinned_until"?: string | null,"send_push"?: boolean | null,"sent_at"?: string | null,"title"?: string | null,"type"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcements_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    }
                  ]
                },"app_config": {
                  Row: {
                    "key": string,"updated_at": string | null,"value": NonNullable<Json>
                  }
                  Insert: {
                    "key": string,"updated_at"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"appeals": {
                  Row: {
                    "body": string | null,"created_at": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": string,"reason_choice": string | null,"status": string,"subject_id": string,"subject_type": string,"user_id": string
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"reason_choice"?: string | null,"status"?: string,"subject_id": string,"subject_type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: string,"reason_choice"?: string | null,"status"?: string,"subject_id"?: string,"subject_type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appeals_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"campus_id": string | null,"case_ref": string | null,"created_at": string,"id": number,"meta": Json | null,"reason": string | null,"target_id": string | null,"target_type": string | null
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"campus_id"?: string | null,"case_ref"?: string | null,"created_at"?: string,"id"?: never,"meta"?: Json | null,"reason"?: string | null,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"campus_id"?: string | null,"case_ref"?: string | null,"created_at"?: string,"id"?: never,"meta"?: Json | null,"reason"?: string | null,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"banned_hashes": {
                  Row: {
                    "created_at": string | null,"email_hash": string
                  }
                  Insert: {
                    "created_at"?: string | null,"email_hash": string
                  }
                  Update: {
                    "created_at"?: string | null,"email_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"banned_words": {
                  Row: {
                    "action": string,"created_at": string | null,"created_by": string | null,"fired_count": number,"id": string,"match": string,"overturned_count": number,"pattern": string,"scopes": (string)[]
                  }
                  Insert: {
                    "action": string,"created_at"?: string | null,"created_by"?: string | null,"fired_count"?: number,"id"?: string,"match"?: string,"overturned_count"?: number,"pattern": string,"scopes": (string)[]
                  }
                  Update: {
                    "action"?: string,"created_at"?: string | null,"created_by"?: string | null,"fired_count"?: number,"id"?: string,"match"?: string,"overturned_count"?: number,"pattern"?: string,"scopes"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string | null
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string | null
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocked_id_fkey"
      columns: ["blocked_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "blocks_blocker_id_fkey"
      columns: ["blocker_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"campus_domains": {
                  Row: {
                    "campus_id": string,"created_at": string,"domain": string,"kind": string
                  }
                  Insert: {
                    "campus_id": string,"created_at"?: string,"domain": string,"kind": string
                  }
                  Update: {
                    "campus_id"?: string,"created_at"?: string,"domain"?: string,"kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campus_domains_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campus_domains_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    }
                  ]
                },"campuses": {
                  Row: {
                    "created_at": string,"founding_seller_limit": number,"id": string,"is_demo": boolean,"name": string,"noshow_pause_threshold": number,"offers_per_hour": number,"quad_enabled": boolean,"reverify_months": number,"short_name": string,"slug": string,"status": Database["public"]['Enums']["campus_status"],"timezone": string,"unlock_threshold": number,"unlocked_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"founding_seller_limit"?: number,"id"?: string,"is_demo"?: boolean,"name": string,"noshow_pause_threshold"?: number,"offers_per_hour"?: number,"quad_enabled"?: boolean,"reverify_months"?: number,"short_name": string,"slug": string,"status"?: Database["public"]['Enums']["campus_status"],"timezone"?: string,"unlock_threshold"?: number,"unlocked_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"founding_seller_limit"?: number,"id"?: string,"is_demo"?: boolean,"name"?: string,"noshow_pause_threshold"?: number,"offers_per_hour"?: number,"quad_enabled"?: boolean,"reverify_months"?: number,"short_name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["campus_status"],"timezone"?: string,"unlock_threshold"?: number,"unlocked_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "id": number,"name": string | null,"parent_id": number | null,"slug": string | null,"sort": number | null
                  }
                  Insert: {
                    "id": number,"name"?: string | null,"parent_id"?: number | null,"slug"?: string | null,"sort"?: number | null
                  }
                  Update: {
                    "id"?: number,"name"?: string | null,"parent_id"?: number | null,"slug"?: string | null,"sort"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"chats": {
                  Row: {
                    "agreed_cents": number,"archived_at": string | null,"buyer_hidden": boolean,"buyer_id": string | null,"buyer_muted": boolean,"buyer_outcome": string | null,"buyer_read_at": string | null,"closed_at": string | null,"created_at": string,"id": string,"last_message_at": string,"listing_id": string | null,"listing_price_cents": number,"listing_thumb_path": string | null,"listing_title": string,"offer_id": string | null,"seller_hidden": boolean,"seller_id": string | null,"seller_muted": boolean,"seller_outcome": string | null,"seller_read_at": string | null,"status": Database["public"]['Enums']["chat_status"]
                  }
                  Insert: {
                    "agreed_cents": number,"archived_at"?: string | null,"buyer_hidden"?: boolean,"buyer_id"?: string | null,"buyer_muted"?: boolean,"buyer_outcome"?: string | null,"buyer_read_at"?: string | null,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"last_message_at"?: string,"listing_id"?: string | null,"listing_price_cents": number,"listing_thumb_path"?: string | null,"listing_title": string,"offer_id"?: string | null,"seller_hidden"?: boolean,"seller_id"?: string | null,"seller_muted"?: boolean,"seller_outcome"?: string | null,"seller_read_at"?: string | null,"status"?: Database["public"]['Enums']["chat_status"]
                  }
                  Update: {
                    "agreed_cents"?: number,"archived_at"?: string | null,"buyer_hidden"?: boolean,"buyer_id"?: string | null,"buyer_muted"?: boolean,"buyer_outcome"?: string | null,"buyer_read_at"?: string | null,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"last_message_at"?: string,"listing_id"?: string | null,"listing_price_cents"?: number,"listing_thumb_path"?: string | null,"listing_title"?: string,"offer_id"?: string | null,"seller_hidden"?: boolean,"seller_id"?: string | null,"seller_muted"?: boolean,"seller_outcome"?: string | null,"seller_read_at"?: string | null,"status"?: Database["public"]['Enums']["chat_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "chats_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "chats_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "chats_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chats_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chats_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chats_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: true
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chats_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "chats_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "chats_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "chats_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"common_first_names": {
                  Row: {
                    "name": string
                  }
                  Insert: {
                    "name": string
                  }
                  Update: {
                    "name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"daily_counters": {
                  Row: {
                    "campus_id": string,"day": string,"key": string,"value": number
                  }
                  Insert: {
                    "campus_id": string,"day": string,"key": string,"value"?: number
                  }
                  Update: {
                    "campus_id"?: string,"day"?: string,"key"?: string,"value"?: number
                  }
                  Relationships: [
                    
                  ]
                },"data_exports": {
                  Row: {
                    "created_at": string | null,"expires_at": string | null,"id": string,"path": string | null,"status": string | null,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"expires_at"?: string | null,"id"?: string,"path"?: string | null,"status"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"expires_at"?: string | null,"id"?: string,"path"?: string | null,"status"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "data_exports_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"email_outbox": {
                  Row: {
                    "attempts": number,"claimed_at": string | null,"dedupe_key": string | null,"error": string | null,"id": number,"send_after": string,"sent_at": string | null,"state": string,"template": string,"to_email": string,"vars": NonNullable<Json>
                  }
                  Insert: {
                    "attempts"?: number,"claimed_at"?: string | null,"dedupe_key"?: string | null,"error"?: string | null,"id"?: never,"send_after"?: string,"sent_at"?: string | null,"state"?: string,"template": string,"to_email": string,"vars"?: NonNullable<Json>
                  }
                  Update: {
                    "attempts"?: number,"claimed_at"?: string | null,"dedupe_key"?: string | null,"error"?: string | null,"id"?: never,"send_after"?: string,"sent_at"?: string | null,"state"?: string,"template"?: string,"to_email"?: string,"vars"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"listing_photos": {
                  Row: {
                    "blurhash": string | null,"height": number | null,"id": string,"idx": number,"listing_id": string,"path": string,"thumb_path": string,"width": number | null
                  }
                  Insert: {
                    "blurhash"?: string | null,"height"?: number | null,"id"?: string,"idx": number,"listing_id": string,"path": string,"thumb_path": string,"width"?: number | null
                  }
                  Update: {
                    "blurhash"?: string | null,"height"?: number | null,"id"?: string,"idx"?: number,"listing_id"?: string,"path"?: string,"thumb_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_photos_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_price_changes": {
                  Row: {
                    "changed_at": string | null,"id": number,"listing_id": string | null,"new_cents": number | null,"old_cents": number | null
                  }
                  Insert: {
                    "changed_at"?: string | null,"id"?: never,"listing_id"?: string | null,"new_cents"?: number | null,"old_cents"?: number | null
                  }
                  Update: {
                    "changed_at"?: string | null,"id"?: never,"listing_id"?: string | null,"new_cents"?: number | null,"old_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_price_changes_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_reservations": {
                  Row: {
                    "created_at": string | null,"id": string,"used_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"id": string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"listings": {
                  Row: {
                    "availability": (string)[],"bumped_at": string,"buyer_id": string | null,"campus_id": string,"category_id": number | null,"condition": Database["public"]['Enums']["item_condition"] | null,"created_at": string,"deleted_at": string | null,"description": string | null,"expires_at": string | null,"hold_offer_id": string | null,"id": string,"kind": Database["public"]['Enums']["listing_kind"],"meet_note": string | null,"meet_spot_ids": (string)[],"offer_count": number,"open_to_offers": boolean,"price_cents": number,"save_count": number,"search": unknown,"seller_id": string | null,"share_image_path": string | null,"sold_at": string | null,"sold_in_app": boolean | null,"status": Database["public"]['Enums']["listing_status"],"title": string,"updated_at": string,"view_count": number,"wanted_max_cents": number | null,"wanted_ref": string | null
                  }
                  Insert: {
                    "availability"?: (string)[],"bumped_at"?: string,"buyer_id"?: string | null,"campus_id": string,"category_id"?: number | null,"condition"?: Database["public"]['Enums']["item_condition"] | null,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"expires_at"?: string | null,"hold_offer_id"?: string | null,"id": string,"kind"?: Database["public"]['Enums']["listing_kind"],"meet_note"?: string | null,"meet_spot_ids"?: (string)[],"offer_count"?: number,"open_to_offers"?: boolean,"price_cents"?: number,"save_count"?: number,"search"?: never,"seller_id"?: string | null,"share_image_path"?: string | null,"sold_at"?: string | null,"sold_in_app"?: boolean | null,"status"?: Database["public"]['Enums']["listing_status"],"title": string,"updated_at"?: string,"view_count"?: number,"wanted_max_cents"?: number | null,"wanted_ref"?: string | null
                  }
                  Update: {
                    "availability"?: (string)[],"bumped_at"?: string,"buyer_id"?: string | null,"campus_id"?: string,"category_id"?: number | null,"condition"?: Database["public"]['Enums']["item_condition"] | null,"created_at"?: string,"deleted_at"?: string | null,"description"?: string | null,"expires_at"?: string | null,"hold_offer_id"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["listing_kind"],"meet_note"?: string | null,"meet_spot_ids"?: (string)[],"offer_count"?: number,"open_to_offers"?: boolean,"price_cents"?: number,"save_count"?: number,"search"?: never,"seller_id"?: string | null,"share_image_path"?: string | null,"sold_at"?: string | null,"sold_in_app"?: boolean | null,"status"?: Database["public"]['Enums']["listing_status"],"title"?: string,"updated_at"?: string,"view_count"?: number,"wanted_max_cents"?: number | null,"wanted_ref"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "listings_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "listings_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_hold_offer_id_fkey"
      columns: ["hold_offer_id"]
isOneToOne: false
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_wanted_ref_fkey"
      columns: ["wanted_ref"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"meetups": {
                  Row: {
                    "buyer_here_at": string | null,"cancel_reason": string | null,"cancelled_by": string | null,"chat_id": string,"confirmed_at": string | null,"created_at": string,"custom_place": string | null,"deal_check_sent_at": string | null,"id": string,"late_minutes": number | null,"late_user": string | null,"previous_starts_at": string | null,"proposed_by": string | null,"reminder_sent_at": string | null,"seller_here_at": string | null,"share_created_by": string | null,"share_expires_at": string | null,"share_token": string | null,"spot_id": string | null,"starts_at": string,"status": Database["public"]['Enums']["meetup_status"]
                  }
                  Insert: {
                    "buyer_here_at"?: string | null,"cancel_reason"?: string | null,"cancelled_by"?: string | null,"chat_id": string,"confirmed_at"?: string | null,"created_at"?: string,"custom_place"?: string | null,"deal_check_sent_at"?: string | null,"id"?: string,"late_minutes"?: number | null,"late_user"?: string | null,"previous_starts_at"?: string | null,"proposed_by"?: string | null,"reminder_sent_at"?: string | null,"seller_here_at"?: string | null,"share_created_by"?: string | null,"share_expires_at"?: string | null,"share_token"?: string | null,"spot_id"?: string | null,"starts_at": string,"status"?: Database["public"]['Enums']["meetup_status"]
                  }
                  Update: {
                    "buyer_here_at"?: string | null,"cancel_reason"?: string | null,"cancelled_by"?: string | null,"chat_id"?: string,"confirmed_at"?: string | null,"created_at"?: string,"custom_place"?: string | null,"deal_check_sent_at"?: string | null,"id"?: string,"late_minutes"?: number | null,"late_user"?: string | null,"previous_starts_at"?: string | null,"proposed_by"?: string | null,"reminder_sent_at"?: string | null,"seller_here_at"?: string | null,"share_created_by"?: string | null,"share_expires_at"?: string | null,"share_token"?: string | null,"spot_id"?: string | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["meetup_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetups_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetups_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "meetups_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "meetups_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetups_proposed_by_fkey"
      columns: ["proposed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetups_spot_id_fkey"
      columns: ["spot_id"]
isOneToOne: false
      referencedRelation: "safe_spots"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string | null,"chat_id": string,"client_id": string | null,"created_at": string,"id": number,"kind": Database["public"]['Enums']["message_kind"],"meta": Json | null,"photo_path": string | null,"sender_id": string | null
                  }
                  Insert: {
                    "body"?: string | null,"chat_id": string,"client_id"?: string | null,"created_at"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["message_kind"],"meta"?: Json | null,"photo_path"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"chat_id"?: string,"client_id"?: string | null,"created_at"?: string,"id"?: never,"kind"?: Database["public"]['Enums']["message_kind"],"meta"?: Json | null,"photo_path"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_sender_id_fkey"
      columns: ["sender_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"noshow_reports": {
                  Row: {
                    "created_at": string,"id": string,"meetup_id": string,"note": string | null,"reported_id": string | null,"reporter_id": string | null,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"meetup_id": string,"note"?: string | null,"reported_id"?: string | null,"reporter_id"?: string | null,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"meetup_id"?: string,"note"?: string | null,"reported_id"?: string | null,"reporter_id"?: string | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "noshow_reports_meetup_id_fkey"
      columns: ["meetup_id"]
isOneToOne: false
      referencedRelation: "meetups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "noshow_reports_reported_id_fkey"
      columns: ["reported_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "noshow_reports_reported_id_fkey"
      columns: ["reported_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "noshow_reports_reported_id_fkey"
      columns: ["reported_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "noshow_reports_reported_id_fkey"
      columns: ["reported_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "noshow_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "noshow_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "noshow_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "noshow_reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_prefs": {
                  Row: {
                    "free_food": boolean,"meetups": boolean,"message_previews": boolean,"messages": boolean,"offers": boolean,"price_drop": boolean,"quad_replies": boolean,"quiet_end": string,"quiet_start": string,"saved_search": boolean,"tips": boolean,"user_id": string
                  }
                  Insert: {
                    "free_food"?: boolean,"meetups"?: boolean,"message_previews"?: boolean,"messages"?: boolean,"offers"?: boolean,"price_drop"?: boolean,"quad_replies"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"saved_search"?: boolean,"tips"?: boolean,"user_id": string
                  }
                  Update: {
                    "free_food"?: boolean,"meetups"?: boolean,"message_previews"?: boolean,"messages"?: boolean,"offers"?: boolean,"price_drop"?: boolean,"quad_replies"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"saved_search"?: boolean,"tips"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"claimed_at": string | null,"created_at": string,"data": NonNullable<Json>,"dedupe_key": string | null,"grp": string,"id": number,"push_after": string,"push_state": Database["public"]['Enums']["push_state"],"read_at": string | null,"time_sensitive": boolean,"title": string,"type": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"claimed_at"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string | null,"grp": string,"id"?: never,"push_after"?: string,"push_state"?: Database["public"]['Enums']["push_state"],"read_at"?: string | null,"time_sensitive"?: boolean,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"claimed_at"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string | null,"grp"?: string,"id"?: never,"push_after"?: string,"push_state"?: Database["public"]['Enums']["push_state"],"read_at"?: string | null,"time_sensitive"?: boolean,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "amount_cents": number,"buyer_id": string | null,"created_at": string,"decline_reason": string | null,"expires_at": string,"id": string,"last_actor": string,"listing_id": string | null,"note": string | null,"quick_notes": (string)[],"responded_at": string | null,"round": number,"seller_id": string | null,"status": Database["public"]['Enums']["offer_status"]
                  }
                  Insert: {
                    "amount_cents": number,"buyer_id"?: string | null,"created_at"?: string,"decline_reason"?: string | null,"expires_at"?: string,"id"?: string,"last_actor"?: string,"listing_id"?: string | null,"note"?: string | null,"quick_notes"?: (string)[],"responded_at"?: string | null,"round"?: number,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["offer_status"]
                  }
                  Update: {
                    "amount_cents"?: number,"buyer_id"?: string | null,"created_at"?: string,"decline_reason"?: string | null,"expires_at"?: string,"id"?: string,"last_actor"?: string,"listing_id"?: string | null,"note"?: string | null,"quick_notes"?: (string)[],"responded_at"?: string | null,"round"?: number,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["offer_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "offers_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "offers_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "adult_confirmed_at": string | null,"age_method": Database["public"]['Enums']["age_method"] | null,"analytics_opt_in": boolean,"areas": (string)[],"avatar_path": string | null,"bio": string | null,"campus_id": string,"crash_reports_opt_in": boolean,"created_at": string,"display_name": string | null,"email_hash": string,"first_name": string | null,"founding_seller_until": string | null,"id": string,"invite_code": string,"invited_by": string | null,"last_active_at": string | null,"last_initial": string | null,"noshow_count": number,"paused_until": string | null,"rules_accepted_at": string | null,"rules_version": string | null,"seen_unlock_at": string | null,"status": Database["public"]['Enums']["user_status"],"status_reason": string | null,"strike_count": number,"theme_mode": string,"verified_until": string,"year": Database["public"]['Enums']["class_year"] | null
                  }
                  Insert: {
                    "adult_confirmed_at"?: string | null,"age_method"?: Database["public"]['Enums']["age_method"] | null,"analytics_opt_in"?: boolean,"areas"?: (string)[],"avatar_path"?: string | null,"bio"?: string | null,"campus_id": string,"crash_reports_opt_in"?: boolean,"created_at"?: string,"display_name"?: never,"email_hash": string,"first_name"?: string | null,"founding_seller_until"?: string | null,"id": string,"invite_code"?: string,"invited_by"?: string | null,"last_active_at"?: string | null,"last_initial"?: string | null,"noshow_count"?: number,"paused_until"?: string | null,"rules_accepted_at"?: string | null,"rules_version"?: string | null,"seen_unlock_at"?: string | null,"status"?: Database["public"]['Enums']["user_status"],"status_reason"?: string | null,"strike_count"?: number,"theme_mode"?: string,"verified_until": string,"year"?: Database["public"]['Enums']["class_year"] | null
                  }
                  Update: {
                    "adult_confirmed_at"?: string | null,"age_method"?: Database["public"]['Enums']["age_method"] | null,"analytics_opt_in"?: boolean,"areas"?: (string)[],"avatar_path"?: string | null,"bio"?: string | null,"campus_id"?: string,"crash_reports_opt_in"?: boolean,"created_at"?: string,"display_name"?: never,"email_hash"?: string,"first_name"?: string | null,"founding_seller_until"?: string | null,"id"?: string,"invite_code"?: string,"invited_by"?: string | null,"last_active_at"?: string | null,"last_initial"?: string | null,"noshow_count"?: number,"paused_until"?: string | null,"rules_accepted_at"?: string | null,"rules_version"?: string | null,"seen_unlock_at"?: string | null,"status"?: Database["public"]['Enums']["user_status"],"status_reason"?: string | null,"strike_count"?: number,"theme_mode"?: string,"verified_until"?: string,"year"?: Database["public"]['Enums']["class_year"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "profiles_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "profiles_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"push_tickets": {
                  Row: {
                    "checked_at": string | null,"created_at": string | null,"error": string | null,"id": number,"notification_id": number | null,"status": string | null,"ticket_id": string | null,"token_id": string | null
                  }
                  Insert: {
                    "checked_at"?: string | null,"created_at"?: string | null,"error"?: string | null,"id"?: never,"notification_id"?: number | null,"status"?: string | null,"ticket_id"?: string | null,"token_id"?: string | null
                  }
                  Update: {
                    "checked_at"?: string | null,"created_at"?: string | null,"error"?: string | null,"id"?: never,"notification_id"?: number | null,"status"?: string | null,"ticket_id"?: string | null,"token_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"push_tokens": {
                  Row: {
                    "app_version": string | null,"created_at": string | null,"disabled_at": string | null,"id": string,"last_seen_at": string | null,"platform": string | null,"token": string,"user_id": string | null
                  }
                  Insert: {
                    "app_version"?: string | null,"created_at"?: string | null,"disabled_at"?: string | null,"id"?: string,"last_seen_at"?: string | null,"platform"?: string | null,"token": string,"user_id"?: string | null
                  }
                  Update: {
                    "app_version"?: string | null,"created_at"?: string | null,"disabled_at"?: string | null,"id"?: string,"last_seen_at"?: string | null,"platform"?: string | null,"token"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "push_tokens_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_counters": {
                  Row: {
                    "action": string,"count": number,"user_id": string,"window_start": string
                  }
                  Insert: {
                    "action": string,"count": number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "action"?: string,"count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ratings": {
                  Row: {
                    "chat_id": string,"comment": string | null,"created_at": string,"id": string,"ratee_id": string | null,"rater_id": string | null,"tags": (string)[],"thumbs_up": boolean
                  }
                  Insert: {
                    "chat_id": string,"comment"?: string | null,"created_at"?: string,"id"?: string,"ratee_id"?: string | null,"rater_id"?: string | null,"tags"?: (string)[],"thumbs_up": boolean
                  }
                  Update: {
                    "chat_id"?: string,"comment"?: string | null,"created_at"?: string,"id"?: string,"ratee_id"?: string | null,"rater_id"?: string | null,"tags"?: (string)[],"thumbs_up"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "ratings_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "action_taken": string | null,"assigned_to": string | null,"campus_id": string,"created_at": string,"details": string | null,"evidence": NonNullable<Json>,"id": string,"priority": number,"reason": string,"reporter_id": string | null,"resolved_at": string | null,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_type": string,"target_user_id": string | null
                  }
                  Insert: {
                    "action_taken"?: string | null,"assigned_to"?: string | null,"campus_id": string,"created_at"?: string,"details"?: string | null,"evidence"?: NonNullable<Json>,"id"?: string,"priority"?: number,"reason": string,"reporter_id"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id": string,"target_type": string,"target_user_id"?: string | null
                  }
                  Update: {
                    "action_taken"?: string | null,"assigned_to"?: string | null,"campus_id"?: string,"created_at"?: string,"details"?: string | null,"evidence"?: NonNullable<Json>,"id"?: string,"priority"?: number,"reason"?: string,"reporter_id"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string,"target_type"?: string,"target_user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_reporter_id_fkey"
      columns: ["reporter_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "reports_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "reports_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_target_user_id_fkey"
      columns: ["target_user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"review_accounts": {
                  Row: {
                    "email": string,"note": string | null
                  }
                  Insert: {
                    "email": string,"note"?: string | null
                  }
                  Update: {
                    "email"?: string,"note"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"safe_spots": {
                  Row: {
                    "active": boolean,"campus_id": string,"description": string | null,"designated_on": string | null,"designation": Database["public"]['Enums']["spot_designation"],"hours": string | null,"id": string,"is_default": boolean,"lat": number,"lng": number,"name": string,"sort": number | null
                  }
                  Insert: {
                    "active"?: boolean,"campus_id": string,"description"?: string | null,"designated_on"?: string | null,"designation"?: Database["public"]['Enums']["spot_designation"],"hours"?: string | null,"id"?: string,"is_default"?: boolean,"lat": number,"lng": number,"name": string,"sort"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"campus_id"?: string,"description"?: string | null,"designated_on"?: string | null,"designation"?: Database["public"]['Enums']["spot_designation"],"hours"?: string | null,"id"?: string,"is_default"?: boolean,"lat"?: number,"lng"?: number,"name"?: string,"sort"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "safe_spots_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "safe_spots_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "alerts": boolean,"campus_id": string,"created_at": string | null,"filters": NonNullable<Json>,"id": string,"last_notified_at": string | null,"last_seen_at": string | null,"query": string | null,"user_id": string
                  }
                  Insert: {
                    "alerts"?: boolean,"campus_id": string,"created_at"?: string | null,"filters"?: NonNullable<Json>,"id"?: string,"last_notified_at"?: string | null,"last_seen_at"?: string | null,"query"?: string | null,"user_id": string
                  }
                  Update: {
                    "alerts"?: boolean,"campus_id"?: string,"created_at"?: string | null,"filters"?: NonNullable<Json>,"id"?: string,"last_notified_at"?: string | null,"last_seen_at"?: string | null,"query"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_searches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "saved_searches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "saved_searches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_searches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"saves": {
                  Row: {
                    "created_at": string | null,"listing_id": string,"price_at_save": number | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"listing_id": string,"price_at_save"?: number | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"listing_id"?: string,"price_at_save"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saves_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saves_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "saves_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "saves_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saves_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"strikes": {
                  Row: {
                    "cleared_at": string | null,"created_at": string | null,"created_by": string | null,"expires_at": string | null,"id": string,"reason": string | null,"report_id": string | null,"user_id": string | null
                  }
                  Insert: {
                    "cleared_at"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"reason"?: string | null,"report_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "cleared_at"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"reason"?: string | null,"report_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "strikes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "strikes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "strikes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "strikes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"support_requests": {
                  Row: {
                    "body": string | null,"created_at": string | null,"email": string | null,"handled_at": string | null,"id": string,"topic": string | null
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string | null,"email"?: string | null,"handled_at"?: string | null,"id"?: string,"topic"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string | null,"email"?: string | null,"handled_at"?: string | null,"id"?: string,"topic"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"swipes": {
                  Row: {
                    "created_at": string | null,"dir": Database["public"]['Enums']["swipe_dir"],"listing_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"dir": Database["public"]['Enums']["swipe_dir"],"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"dir"?: Database["public"]['Enums']["swipe_dir"],"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "swipes_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "swipes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "swipes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "swipes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "swipes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"waitlist_requests": {
                  Row: {
                    "created_at": string | null,"domain": string,"email_enc": string,"email_hash": string,"id": string,"notified_at": string | null,"school_guess": string | null
                  }
                  Insert: {
                    "created_at"?: string | null,"domain": string,"email_enc": string,"email_hash": string,"id"?: string,"notified_at"?: string | null,"school_guess"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"domain"?: string,"email_enc"?: string,"email_hash"?: string,"id"?: string,"notified_at"?: string | null,"school_guess"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"watches": {
                  Row: {
                    "created_at": string | null,"listing_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string | null,"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "watches_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "watches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "watches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "watches_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "campus_progress": {
                  Row: {
                    "founding_left": number | null,"id": string | null,"members": number | null,"name": string | null,"slug": string | null,"status": Database["public"]['Enums']["campus_status"] | null,"threshold": number | null
                  }
                  Insert: {
                           "founding_left"?: never,"id"?: string | null,"members"?: never,"name"?: string | null,"slug"?: string | null,"status"?: Database["public"]['Enums']["campus_status"] | null,"threshold"?: number | null
                         }
                        Update: {
                           "founding_left"?: never,"id"?: string | null,"members"?: never,"name"?: string | null,"slug"?: string | null,"status"?: Database["public"]['Enums']["campus_status"] | null,"threshold"?: number | null
                         }
                        Relationships: [
                    
                  ]
                },"campus_trending_terms": {
                  Row: {
                    "campus_id": string | null,"rank": number | null,"saves": number | null,"term": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    }
                  ]
                },"my_reports": {
                  Row: {
                    "created_at": string | null,"id": string | null,"reason": string | null,"resolved_at": string | null,"status": Database["public"]['Enums']["report_status"] | null,"target_id": string | null,"target_type": string | null
                  }
                  Insert: {
                           "created_at"?: string | null,"id"?: string | null,"reason"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"] | null,"target_id"?: string | null,"target_type"?: string | null
                         }
                        Update: {
                           "created_at"?: string | null,"id"?: string | null,"reason"?: string | null,"resolved_at"?: string | null,"status"?: Database["public"]['Enums']["report_status"] | null,"target_id"?: string | null,"target_type"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"price_hints": {
                  Row: {
                    "campus_id": string | null,"category_id": number | null,"n": number | null,"p25": number | null,"p50": number | null,"p75": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_stats": {
                  Row: {
                    "active_listings": number | null,"median_reply_minutes": number | null,"swaps_count": number | null,"thumbs_total": number | null,"thumbs_up": number | null,"user_id": string | null
                  }
                  Relationships: [
                    
                  ]
                },"profile_stats_mv": {
                  Row: {
                    "active_listings": number | null,"campus_id": string | null,"median_reply_minutes": number | null,"swaps_count": number | null,"thumbs_total": number | null,"thumbs_up": number | null,"user_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campus_progress"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_campus_id_fkey"
      columns: ["campus_id"]
isOneToOne: false
      referencedRelation: "campuses"
      referencedColumns: ["id"]
    }
                  ]
                },"public_profiles": {
                  Row: {
                    "avatar_path": string | null,"created_at": string | null,"display_name": string | null,"founding_seller_until": string | null,"id": string | null,"year": Database["public"]['Enums']["class_year"] | null
                  }
                  Insert: {
                           "avatar_path"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"founding_seller_until"?: string | null,"id"?: string | null,"year"?: Database["public"]['Enums']["class_year"] | null
                         }
                        Update: {
                           "avatar_path"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"founding_seller_until"?: string | null,"id"?: string | null,"year"?: Database["public"]['Enums']["class_year"] | null
                         }
                        Relationships: [
                    
                  ]
                },"ratings_visible": {
                  Row: {
                    "chat_id": string | null,"comment": string | null,"created_at": string | null,"id": string | null,"ratee_id": string | null,"rater_id": string | null,"rater_name": string | null,"tags": (string)[] | null,"thumbs_up": boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ratings_chat_id_fkey"
      columns: ["chat_id"]
isOneToOne: false
      referencedRelation: "chats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_ratee_id_fkey"
      columns: ["ratee_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "profile_stats"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "profile_stats_mv"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ratings_rater_id_fkey"
      columns: ["rater_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_rules":
{ Args: { "version": string }; Returns: undefined
                           },
"accept_offer":
{ Args: { "offer_id": string }; Returns: Json
                           },
"admin_change_email":
{ Args: { "new_email": string,"user_id": string }; Returns: Json
                           },
"block_user":
{ Args: { "user_id": string }; Returns: undefined
                           },
"cancel_meetup":
{ Args: { "meetup_id": string,"reason"?: string }; Returns: undefined
                           },
"check_text":
{ Args: { "scope": string,"text": string }; Returns: Json
                           },
"checkin_meetup":
{ Args: { "meetup_id": string }; Returns: undefined
                           },
"complete_reverify":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"confirm_age":
{ Args: { "birth_date"?: string,"is_adult"?: boolean,"method": string }; Returns: Json
                           },
"confirm_deal":
{ Args: { "chat_id": string,"outcome": string }; Returns: undefined
                           },
"confirm_meetup":
{ Args: { "meetup_id": string }; Returns: undefined
                           },
"counter_offer":
{ Args: { "amount_cents": number,"note"?: string,"offer_id": string }; Returns: Json
                           },
"create_appeal":
{ Args: { "body"?: string,"reason_choice"?: string,"subject_id": string,"subject_type": string }; Returns: Json
                           },
"create_listing":
{ Args: { "availability"?: (string)[],"category_id"?: number,"condition"?: Database["public"]['Enums']["item_condition"],"description"?: string,"food_minutes"?: number,"id": string,"kind"?: Database["public"]['Enums']["listing_kind"],"meet_note"?: string,"meet_spot_ids"?: (string)[],"open_to_offers"?: boolean,"photos"?: Json,"pickup_by"?: string,"price_cents"?: number,"title"?: string,"wanted_max_cents"?: number,"wanted_ref"?: string }; Returns: Json
                           },
"create_meetup_share":
{ Args: { "meetup_id": string }; Returns: Json
                           },
"create_report":
{ Args: { "details"?: string,"reason": string,"target_id": string,"target_type": string }; Returns: Json
                           },
"create_saved_search":
{ Args: { "alerts"?: boolean,"filters"?: Json,"query"?: string }; Returns: Json
                           },
"decline_offer":
{ Args: { "offer_id": string,"reason"?: string }; Returns: undefined
                           },
"delete_listing":
{ Args: { "id": string }; Returns: undefined
                           },
"delete_saved_search":
{ Args: { "id": string }; Returns: undefined
                           },
"disable_push_token":
{ Args: { "token": string }; Returns: undefined
                           },
"get_account_status":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_app_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_chat":
{ Args: { "chat_id": string }; Returns: Json
                           },
"get_chat_meetup":
{ Args: { "chat_id": string }; Returns: Json
                           },
"get_feed":
{ Args: { "cursor"?: Json,"limit"?: number }; Returns: Json
                           },
"get_inbox":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_listing":
{ Args: { "id": string }; Returns: Json
                           },
"get_me":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_meetup":
{ Args: { "meetup_id": string }; Returns: Json
                           },
"get_meetup_share":
{ Args: { "token": string }; Returns: Json
                           },
"get_messages":
{ Args: { "after"?: number,"before"?: number,"chat_id": string,"limit"?: number }; Returns: Json
                           },
"get_my_rating":
{ Args: { "chat_id": string }; Returns: Json
                           },
"get_my_report":
{ Args: { "id": string }; Returns: Json
                           },
"get_notification_prefs":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_notifications":
{ Args: { "cursor"?: number,"limit"?: number }; Returns: Json
                           },
"get_offer":
{ Args: { "offer_id": string }; Returns: Json
                           },
"get_profile":
{ Args: { "user_id": string }; Returns: Json
                           },
"get_saved":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"hide_chat":
{ Args: { "chat_id": string }; Returns: undefined
                           },
"hide_listing":
{ Args: { "listing_id": string }; Returns: undefined
                           },
"list_blocked":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_saved_searches":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"listing_offers":
{ Args: { "id": string }; Returns: Json
                           },
"listing_stats":
{ Args: { "id": string }; Returns: Json
                           },
"lookup_school":
{ Args: { "domain": string }; Returns: Json
                           },
"make_offer":
{ Args: { "amount_cents": number,"listing_id": string,"note"?: string,"quick_notes"?: (string)[] }; Returns: Json
                           },
"mark_chat_read":
{ Args: { "chat_id": string }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "ids"?: (number)[] }; Returns: undefined
                           },
"mark_sold":
{ Args: { "buyer_id"?: string,"id": string }; Returns: undefined
                           },
"my_listings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_waitlist_position":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"price_hint":
{ Args: { "category_id": number }; Returns: Json
                           },
"propose_meetup":
{ Args: { "chat_id": string,"custom_place"?: string,"spot_id"?: string,"starts_at": string }; Returns: Json
                           },
"record_swipes":
{ Args: { "items": Json }; Returns: undefined
                           },
"record_view":
{ Args: { "listing_id": string }; Returns: undefined
                           },
"register_push_token":
{ Args: { "app_version"?: string,"platform": string,"token": string }; Returns: undefined
                           },
"relist_listing":
{ Args: { "id": string,"price_cents"?: number }; Returns: Json
                           },
"report_noshow":
{ Args: { "meetup_id": string,"note"?: string }; Returns: undefined
                           },
"reserve_listing_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"running_late":
{ Args: { "meetup_id": string,"minutes": number }; Returns: undefined
                           },
"save_listing":
{ Args: { "listing_id": string }; Returns: Json
                           },
"saved_search_new_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"search_listings":
{ Args: { "cursor"?: Json,"filters"?: Json,"q"?: string }; Returns: Json
                           },
"search_suggest":
{ Args: { "q"?: string }; Returns: Json
                           },
"send_message":
{ Args: { "body": string,"chat_id": string,"client_id": string,"kind"?: string }; Returns: Json
                           },
"set_chat_mute":
{ Args: { "chat_id": string,"muted": boolean }; Returns: undefined
                           },
"set_listing_share_image":
{ Args: { "id": string }; Returns: Json
                           },
"submit_rating":
{ Args: { "chat_id": string,"comment"?: string,"tags"?: (string)[],"thumbs_up": boolean }; Returns: undefined
                           },
"unblock_user":
{ Args: { "user_id": string }; Returns: undefined
                           },
"undo_swipe":
{ Args: { "listing_id": string }; Returns: undefined
                           },
"unsave_listing":
{ Args: { "listing_id": string }; Returns: Json
                           },
"update_listing":
{ Args: { "availability"?: (string)[],"category_id"?: number,"condition"?: Database["public"]['Enums']["item_condition"],"description"?: string,"id": string,"meet_note"?: string,"meet_spot_ids"?: (string)[],"open_to_offers"?: boolean,"photos"?: Json,"price_cents"?: number,"title"?: string }; Returns: Json
                           },
"update_notification_prefs":
{ Args: { "prefs": Json }; Returns: Json
                           },
"update_profile":
{ Args: { "areas"?: (string)[],"avatar_path"?: string,"bio"?: string,"first_name": string,"last_initial"?: string,"year"?: Database["public"]['Enums']["class_year"] }; Returns: Json
                           },
"update_profile_flags":
{ Args: { "analytics_opt_in"?: boolean,"crash_reports_opt_in"?: boolean,"theme_mode"?: string }; Returns: undefined
                           },
"update_saved_search":
{ Args: { "alerts"?: boolean,"id": string,"seen"?: boolean }; Returns: Json
                           },
"watch_listing":
{ Args: { "listing_id": string }; Returns: undefined
                           },
"withdraw_offer":
{ Args: { "offer_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "admin_role": "owner"|"moderator","age_method": "os_signal"|"self_declared"|"review","campus_status": "waitlist"|"live"|"paused","chat_status": "open"|"closed"|"blocked","class_year": "freshman"|"sophomore"|"junior"|"senior"|"grad"|"other","item_condition": "new"|"like_new"|"good"|"fair","listing_kind": "sale"|"free"|"wanted"|"food","listing_status": "active"|"hold"|"sold"|"expired"|"held_review"|"removed"|"deleted","meetup_status": "proposed"|"confirmed"|"cancelled"|"completed"|"no_show","message_kind": "text"|"system"|"meetup"|"photo","offer_status": "pending"|"countered"|"accepted"|"declined"|"expired"|"withdrawn"|"auto_declined","push_state": "pending"|"sending"|"sent"|"skipped"|"failed","report_status": "open"|"actioned"|"dismissed","spot_designation": "public"|"police","swipe_dir": "left"|"save","user_status": "active"|"waitlist"|"reverify"|"paused"|"suspended"|"banned"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "admin_role": ["owner", "moderator"],"age_method": ["os_signal", "self_declared", "review"],"campus_status": ["waitlist", "live", "paused"],"chat_status": ["open", "closed", "blocked"],"class_year": ["freshman", "sophomore", "junior", "senior", "grad", "other"],"item_condition": ["new", "like_new", "good", "fair"],"listing_kind": ["sale", "free", "wanted", "food"],"listing_status": ["active", "hold", "sold", "expired", "held_review", "removed", "deleted"],"meetup_status": ["proposed", "confirmed", "cancelled", "completed", "no_show"],"message_kind": ["text", "system", "meetup", "photo"],"offer_status": ["pending", "countered", "accepted", "declined", "expired", "withdrawn", "auto_declined"],"push_state": ["pending", "sending", "sent", "skipped", "failed"],"report_status": ["open", "actioned", "dismissed"],"spot_designation": ["public", "police"],"swipe_dir": ["left", "save"],"user_status": ["active", "waitlist", "reverify", "paused", "suspended", "banned"]
          }
        }
} as const

