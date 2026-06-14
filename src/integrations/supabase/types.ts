export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          club_id: string | null
          created_at: string
          details: Json | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          club_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          club_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      assistant_coach_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          club_id: string
          id: string
          member_id: string
          tier_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          club_id: string
          id?: string
          member_id: string
          tier_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          club_id?: string
          id?: string
          member_id?: string
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_coach_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_coach_assignments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_coach_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_coach_assignments_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "assistant_coach_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_coach_tiers: {
        Row: {
          can_create_sessions: boolean | null
          can_edit_sessions: boolean | null
          can_invite_members: boolean | null
          can_manage_attendance: boolean | null
          can_manage_carpools: boolean | null
          can_manage_equipment: boolean | null
          can_manage_member_rsvps: boolean | null
          can_manage_surveys: boolean | null
          can_manage_training_plans: boolean | null
          can_manage_waves: boolean | null
          can_view_medical_info: boolean | null
          club_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          tier_level: number
          tier_name: string
        }
        Insert: {
          can_create_sessions?: boolean | null
          can_edit_sessions?: boolean | null
          can_invite_members?: boolean | null
          can_manage_attendance?: boolean | null
          can_manage_carpools?: boolean | null
          can_manage_equipment?: boolean | null
          can_manage_member_rsvps?: boolean | null
          can_manage_surveys?: boolean | null
          can_manage_training_plans?: boolean | null
          can_manage_waves?: boolean | null
          can_view_medical_info?: boolean | null
          club_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tier_level: number
          tier_name: string
        }
        Update: {
          can_create_sessions?: boolean | null
          can_edit_sessions?: boolean | null
          can_invite_members?: boolean | null
          can_manage_attendance?: boolean | null
          can_manage_carpools?: boolean | null
          can_manage_equipment?: boolean | null
          can_manage_member_rsvps?: boolean | null
          can_manage_surveys?: boolean | null
          can_manage_training_plans?: boolean | null
          can_manage_waves?: boolean | null
          can_view_medical_info?: boolean | null
          club_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tier_level?: number
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_coach_tiers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          club_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          request_id: string | null
          session_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          club_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          request_id?: string | null
          session_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          club_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          request_id?: string | null
          session_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      carpool_passengers: {
        Row: {
          assigned_at: string
          carpool_id: string
          id: string
          notes: string | null
          pickup_location: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          carpool_id: string
          id?: string
          notes?: string | null
          pickup_location?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          carpool_id?: string
          id?: string
          notes?: string | null
          pickup_location?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carpool_passengers_carpool_id_fkey"
            columns: ["carpool_id"]
            isOneToOne: false
            referencedRelation: "carpools"
            referencedColumns: ["id"]
          },
        ]
      }
      carpool_requests: {
        Row: {
          club_id: string
          created_at: string
          id: string
          notes: string | null
          pickup_location: string
          preferred_time: string | null
          session_id: string
          status: Database["public"]["Enums"]["carpool_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          notes?: string | null
          pickup_location: string
          preferred_time?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["carpool_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          pickup_location?: string
          preferred_time?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["carpool_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      carpool_templates: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
          vehicles: Json
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          vehicles?: Json
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          vehicles?: Json
        }
        Relationships: [
          {
            foreignKeyName: "carpool_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      carpools: {
        Row: {
          available_seats: number
          can_tow_trailer: boolean
          club_id: string
          created_at: string
          departure_location: string
          departure_time: string
          driver_user_id: string
          id: string
          notes: string | null
          session_id: string
          status: Database["public"]["Enums"]["carpool_status"]
          updated_at: string
          vehicle_name: string
        }
        Insert: {
          available_seats: number
          can_tow_trailer?: boolean
          club_id: string
          created_at?: string
          departure_location: string
          departure_time: string
          driver_user_id: string
          id?: string
          notes?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["carpool_status"]
          updated_at?: string
          vehicle_name: string
        }
        Update: {
          available_seats?: number
          can_tow_trailer?: boolean
          club_id?: string
          created_at?: string
          departure_location?: string
          departure_time?: string
          driver_user_id?: string
          id?: string
          notes?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["carpool_status"]
          updated_at?: string
          vehicle_name?: string
        }
        Relationships: []
      }
      chat_channels: {
        Row: {
          club_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          type?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_members: {
        Row: {
          channel_id: string | null
          id: string
          joined_at: string | null
          last_read_at: string | null
          member_id: string | null
        }
        Insert: {
          channel_id?: string | null
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          member_id?: string | null
        }
        Update: {
          channel_id?: string | null
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          channel_id: string | null
          created_at: string | null
          edited_at: string | null
          id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          channel_id?: string | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          channel_id?: string | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      club_invite_codes: {
        Row: {
          active: boolean
          club_id: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          club_id: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          club_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      club_memberships: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          club_id: string
          crew_flag: boolean | null
          driver_flag: boolean | null
          expires_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_primary_club: boolean | null
          joined_at: string | null
          notes: string | null
          patient_flag: boolean | null
          requested_at: string
          role: string | null
          season: string | null
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          club_id: string
          crew_flag?: boolean | null
          driver_flag?: boolean | null
          expires_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_primary_club?: boolean | null
          joined_at?: string | null
          notes?: string | null
          patient_flag?: boolean | null
          requested_at?: string
          role?: string | null
          season?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          club_id?: string
          crew_flag?: boolean | null
          driver_flag?: boolean | null
          expires_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_primary_club?: boolean | null
          joined_at?: string | null
          notes?: string | null
          patient_flag?: boolean | null
          requested_at?: string
          role?: string | null
          season?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          address: string | null
          branding: Json | null
          club_code: string | null
          club_name: string
          contact_email: string | null
          contact_phone: string | null
          country: string
          created_at: string | null
          feature_flags: Json | null
          id: string
          is_active: boolean | null
          max_members: number | null
          postcode: string | null
          season_start_month: number | null
          slsa_club_number: string | null
          state_region: string | null
          subscription_expires_at: string | null
          subscription_status: string | null
          suburb: string | null
          timezone: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          branding?: Json | null
          club_code?: string | null
          club_name: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string | null
          feature_flags?: Json | null
          id?: string
          is_active?: boolean | null
          max_members?: number | null
          postcode?: string | null
          season_start_month?: number | null
          slsa_club_number?: string | null
          state_region?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          suburb?: string | null
          timezone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          branding?: Json | null
          club_code?: string | null
          club_name?: string
          contact_email?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string | null
          feature_flags?: Json | null
          id?: string
          is_active?: boolean | null
          max_members?: number | null
          postcode?: string | null
          season_start_month?: number | null
          slsa_club_number?: string | null
          state_region?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          suburb?: string | null
          timezone?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      coach_permissions: {
        Row: {
          club_id: string
          manage_attendance: boolean
          manage_documents: boolean
          manage_equipment: boolean
          manage_member_rsvps: boolean
          manage_templates: boolean
          manage_training_plans: boolean
          manage_waves: boolean
          updated_at: string
          updated_by: string | null
          view_emergency: boolean
          view_medical: boolean
          view_survey_results: boolean
        }
        Insert: {
          club_id: string
          manage_attendance?: boolean
          manage_documents?: boolean
          manage_equipment?: boolean
          manage_member_rsvps?: boolean
          manage_templates?: boolean
          manage_training_plans?: boolean
          manage_waves?: boolean
          updated_at?: string
          updated_by?: string | null
          view_emergency?: boolean
          view_medical?: boolean
          view_survey_results?: boolean
        }
        Update: {
          club_id?: string
          manage_attendance?: boolean
          manage_documents?: boolean
          manage_equipment?: boolean
          manage_member_rsvps?: boolean
          manage_templates?: boolean
          manage_training_plans?: boolean
          manage_waves?: boolean
          updated_at?: string
          updated_by?: string | null
          view_emergency?: boolean
          view_medical?: boolean
          view_survey_results?: boolean
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          member_id: string
          name: string
          phone: string | null
          relationship: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          member_id: string
          name: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          member_id?: string
          name?: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          category: string | null
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["equipment_status"]
          updated_at: string
        }
        Insert: {
          category?: string | null
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
        }
        Update: {
          category?: string | null
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["equipment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      equipment_faults: {
        Row: {
          club_id: string
          created_at: string
          description: string
          equipment_id: string | null
          equipment_name: string | null
          id: string
          reported_at: string
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["fault_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          description: string
          equipment_id?: string | null
          equipment_name?: string | null
          id?: string
          reported_at?: string
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["fault_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          description?: string
          equipment_id?: string | null
          equipment_name?: string | null
          id?: string
          reported_at?: string
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["fault_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_faults_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_faults_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_list_items: {
        Row: {
          category: string
          created_at: string
          equipment_id: string | null
          id: string
          list_id: string
          name: string
          quantity: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          equipment_id?: string | null
          id?: string
          list_id: string
          name: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          equipment_id?: string | null
          id?: string
          list_id?: string
          name?: string
          quantity?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_list_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "equipment_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_list_packed: {
        Row: {
          item_id: string
          packed_at: string
          packed_by: string
        }
        Insert: {
          item_id: string
          packed_at?: string
          packed_by: string
        }
        Update: {
          item_id?: string
          packed_at?: string
          packed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_list_packed_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "equipment_list_items"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_lists: {
        Row: {
          archived_at: string | null
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string | null
          event_name: string | null
          id: string
          location: string | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string | null
          event_name?: string | null
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string | null
          event_name?: string | null
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_entries: {
        Row: {
          age_group: string | null
          club_id: string
          discipline: string
          entered_at: string | null
          entry_status: string | null
          event_id: string
          id: string
          member_id: string
          notes: string | null
          place: number | null
          result: string | null
        }
        Insert: {
          age_group?: string | null
          club_id: string
          discipline: string
          entered_at?: string | null
          entry_status?: string | null
          event_id: string
          id?: string
          member_id: string
          notes?: string | null
          place?: number | null
          result?: string | null
        }
        Update: {
          age_group?: string | null
          club_id?: string
          discipline?: string
          entered_at?: string | null
          entry_status?: string | null
          event_id?: string
          id?: string
          member_id?: string
          notes?: string | null
          place?: number | null
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          club_id: string | null
          country: string | null
          created_at: string | null
          end_date: string | null
          event_date: string
          event_name: string
          event_type: string
          host_club_id: string | null
          host_club_name: string | null
          id: string
          location: string | null
          notes: string | null
        }
        Insert: {
          club_id?: string | null
          country?: string | null
          created_at?: string | null
          end_date?: string | null
          event_date: string
          event_name: string
          event_type: string
          host_club_id?: string | null
          host_club_name?: string | null
          id?: string
          location?: string | null
          notes?: string | null
        }
        Update: {
          club_id?: string | null
          country?: string | null
          created_at?: string | null
          end_date?: string | null
          event_date?: string
          event_name?: string
          event_type?: string
          host_club_id?: string | null
          host_club_name?: string | null
          id?: string
          location?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_club_id_fkey"
            columns: ["host_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_attendance: {
        Row: {
          arrived_at: string | null
          attended: boolean | null
          club_id: string
          id: string
          member_id: string
          performance_rating: number | null
          role_on_day: string | null
          session_id: string
          signed_off: boolean | null
          signed_off_by: string | null
          trainer_notes: string | null
        }
        Insert: {
          arrived_at?: string | null
          attended?: boolean | null
          club_id: string
          id?: string
          member_id: string
          performance_rating?: number | null
          role_on_day?: string | null
          session_id: string
          signed_off?: boolean | null
          signed_off_by?: string | null
          trainer_notes?: string | null
        }
        Update: {
          arrived_at?: string | null
          attended?: boolean | null
          club_id?: string
          id?: string
          member_id?: string
          performance_rating?: number | null
          role_on_day?: string | null
          session_id?: string
          signed_off?: boolean | null
          signed_off_by?: string | null
          trainer_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "irb_attendance_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "irb_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_attendance_signed_off_by_fkey"
            columns: ["signed_off_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_equipment: {
        Row: {
          club_id: string
          created_at: string | null
          equipment_type: string
          id: string
          identifier: string | null
          is_active: boolean | null
          last_service_date: string | null
          name: string
          next_service_date: string | null
          notes: string | null
          purchase_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          equipment_type: string
          id?: string
          identifier?: string | null
          is_active?: boolean | null
          last_service_date?: string | null
          name: string
          next_service_date?: string | null
          notes?: string | null
          purchase_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          equipment_type?: string
          id?: string
          identifier?: string | null
          is_active?: boolean | null
          last_service_date?: string | null
          name?: string
          next_service_date?: string | null
          notes?: string | null
          purchase_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "irb_equipment_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_equipment_faults: {
        Row: {
          club_id: string
          equipment_id: string
          fault_description: string
          id: string
          reported_at: string | null
          reported_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          club_id: string
          equipment_id: string
          fault_description: string
          id?: string
          reported_at?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          club_id?: string
          equipment_id?: string
          fault_description?: string
          id?: string
          reported_at?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "irb_equipment_faults_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_equipment_faults_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "irb_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_equipment_faults_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_equipment_faults_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_locations: {
        Row: {
          club_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          club_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          club_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "irb_locations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_member_partners: {
        Row: {
          club_id: string | null
          created_at: string
          crew_id: string | null
          driver_id: string | null
          id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          crew_id?: string | null
          driver_id?: string | null
          id?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          crew_id?: string | null
          driver_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "irb_member_partners_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_member_partners_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_member_partners_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_session_draw_configs: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          lanes_count: number
          session_id: string | null
          waves_count: number
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          lanes_count?: number
          session_id?: string | null
          waves_count?: number
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          lanes_count?: number
          session_id?: string | null
          waves_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "irb_session_draw_configs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_draw_configs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "irb_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_session_equipment: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          club_id: string
          condition_on_checkout: string | null
          condition_on_return: string | null
          equipment_id: string
          id: string
          notes: string | null
          session_id: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          club_id: string
          condition_on_checkout?: string | null
          condition_on_return?: string | null
          equipment_id: string
          id?: string
          notes?: string | null
          session_id: string
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          club_id?: string
          condition_on_checkout?: string | null
          condition_on_return?: string | null
          equipment_id?: string
          id?: string
          notes?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "irb_session_equipment_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "irb_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_equipment_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "irb_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_session_rsvps: {
        Row: {
          club_id: string
          id: string
          member_id: string
          notes: string | null
          preferred_role: string | null
          rsvp_at: string | null
          rsvp_status: string | null
          session_id: string
        }
        Insert: {
          club_id: string
          id?: string
          member_id: string
          notes?: string | null
          preferred_role?: string | null
          rsvp_at?: string | null
          rsvp_status?: string | null
          session_id: string
        }
        Update: {
          club_id?: string
          id?: string
          member_id?: string
          notes?: string | null
          preferred_role?: string | null
          rsvp_at?: string | null
          rsvp_status?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "irb_session_rsvps_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_rsvps_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_rsvps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "irb_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_session_teams: {
        Row: {
          boat_id: string | null
          club_id: string
          crew_id: string | null
          driver_id: string | null
          id: string
          lane_number: number
          notes: string | null
          patient_id: string | null
          session_id: string
          wave_number: number
        }
        Insert: {
          boat_id?: string | null
          club_id: string
          crew_id?: string | null
          driver_id?: string | null
          id?: string
          lane_number: number
          notes?: string | null
          patient_id?: string | null
          session_id: string
          wave_number: number
        }
        Update: {
          boat_id?: string | null
          club_id?: string
          crew_id?: string | null
          driver_id?: string | null
          id?: string
          lane_number?: number
          notes?: string | null
          patient_id?: string | null
          session_id?: string
          wave_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "irb_session_teams_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "irb_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_teams_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_teams_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_teams_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_teams_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "irb_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_session_training_blocks: {
        Row: {
          block_order: number
          club_id: string
          description: string | null
          drill_id: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          session_id: string
          title: string
        }
        Insert: {
          block_order: number
          club_id: string
          description?: string | null
          drill_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          session_id: string
          title: string
        }
        Update: {
          block_order?: number
          club_id?: string
          description?: string | null
          drill_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          session_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "irb_session_training_blocks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_training_blocks_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "irb_training_drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_session_training_blocks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "irb_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_sessions: {
        Row: {
          club_id: string
          created_at: string | null
          created_by: string | null
          debrief_notes: string | null
          end_time: string | null
          id: string
          lead_trainer_id: string | null
          location_id: string | null
          location_name: string | null
          max_participants: number | null
          min_crew: number | null
          min_drivers: number | null
          notes: string | null
          qualification_id: string | null
          scheduled_date: string
          sea_conditions: string | null
          session_type: string
          start_time: string | null
          status: string | null
          tide_info: string | null
          title: string
          updated_at: string | null
          weather_conditions: string | null
          wind_speed: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          created_by?: string | null
          debrief_notes?: string | null
          end_time?: string | null
          id?: string
          lead_trainer_id?: string | null
          location_id?: string | null
          location_name?: string | null
          max_participants?: number | null
          min_crew?: number | null
          min_drivers?: number | null
          notes?: string | null
          qualification_id?: string | null
          scheduled_date: string
          sea_conditions?: string | null
          session_type: string
          start_time?: string | null
          status?: string | null
          tide_info?: string | null
          title: string
          updated_at?: string | null
          weather_conditions?: string | null
          wind_speed?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          debrief_notes?: string | null
          end_time?: string | null
          id?: string
          lead_trainer_id?: string | null
          location_id?: string | null
          location_name?: string | null
          max_participants?: number | null
          min_crew?: number | null
          min_drivers?: number | null
          notes?: string | null
          qualification_id?: string | null
          scheduled_date?: string
          sea_conditions?: string | null
          session_type?: string
          start_time?: string | null
          status?: string | null
          tide_info?: string | null
          title?: string
          updated_at?: string | null
          weather_conditions?: string | null
          wind_speed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "irb_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_sessions_lead_trainer_id_fkey"
            columns: ["lead_trainer_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "irb_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_sessions_qualification_id_fkey"
            columns: ["qualification_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id"]
          },
        ]
      }
      irb_training_drills: {
        Row: {
          category: string | null
          club_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          difficulty: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          category?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          category?: string | null
          club_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "irb_training_drills_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irb_training_drills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_info: {
        Row: {
          allergies: string | null
          blood_type: string | null
          conditions: string | null
          id: string
          medications: string | null
          member_id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          allergies?: string | null
          blood_type?: string | null
          conditions?: string | null
          id?: string
          medications?: string | null
          member_id: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          allergies?: string | null
          blood_type?: string | null
          conditions?: string | null
          id?: string
          medications?: string | null
          member_id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medical_info_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_emergency_contacts: {
        Row: {
          club_id: string
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string
          relationship: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone: string
          relationship?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string
          relationship?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_medical_info: {
        Row: {
          allergies: string | null
          blood_type: string | null
          club_id: string
          conditions: string | null
          created_at: string
          id: string
          medications: string | null
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allergies?: string | null
          blood_type?: string | null
          club_id: string
          conditions?: string | null
          created_at?: string
          id?: string
          medications?: string | null
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allergies?: string | null
          blood_type?: string | null
          club_id?: string
          conditions?: string | null
          created_at?: string
          id?: string
          medications?: string | null
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_partners: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          crew_id: string
          driver_id: string
          id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          crew_id: string
          driver_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          crew_id?: string
          driver_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_partners_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_partners_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_partners_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_preferences: {
        Row: {
          created_at: string
          notify_carpool_pending: boolean
          notify_carpool_updates: boolean
          notify_equipment: boolean
          notify_fault_reports: boolean
          notify_join_requests: boolean
          notify_new_sessions: boolean
          notify_session_reminders: boolean
          settings_section_order: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_carpool_pending?: boolean
          notify_carpool_updates?: boolean
          notify_equipment?: boolean
          notify_fault_reports?: boolean
          notify_join_requests?: boolean
          notify_new_sessions?: boolean
          notify_session_reminders?: boolean
          settings_section_order?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_carpool_pending?: boolean
          notify_carpool_updates?: boolean
          notify_equipment?: boolean
          notify_fault_reports?: boolean
          notify_join_requests?: boolean
          notify_new_sessions?: boolean
          notify_session_reminders?: boolean
          settings_section_order?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_qualifications: {
        Row: {
          certificate_number: string | null
          club_id: string
          created_at: string | null
          document_url: string | null
          expiry_date: string | null
          id: string
          issued_by: string | null
          issued_date: string | null
          member_id: string
          notes: string | null
          qualification_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          certificate_number?: string | null
          club_id: string
          created_at?: string | null
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          member_id: string
          notes?: string | null
          qualification_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          certificate_number?: string | null
          club_id?: string
          created_at?: string | null
          document_url?: string | null
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          member_id?: string
          notes?: string | null
          qualification_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_qualifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_qualifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_qualifications_qualification_id_fkey"
            columns: ["qualification_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          address: string | null
          auth_user_id: string | null
          club_id: string
          country: string | null
          created_at: string | null
          crew_flag: boolean | null
          date_of_birth: string | null
          driver_flag: boolean | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          first_name: string
          gender: string | null
          id: string
          join_date: string | null
          last_active_at: string | null
          last_name: string
          locale: string | null
          membership_status: string | null
          membership_type: string | null
          notification_prefs: Json | null
          onboarding_completed_at: string | null
          patient_flag: boolean | null
          phone: string | null
          postcode: string | null
          preferred_name: string | null
          profile_photo_url: string | null
          slsa_member_number: string | null
          suburb: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          auth_user_id?: string | null
          club_id: string
          country?: string | null
          created_at?: string | null
          crew_flag?: boolean | null
          date_of_birth?: string | null
          driver_flag?: boolean | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name: string
          gender?: string | null
          id?: string
          join_date?: string | null
          last_active_at?: string | null
          last_name: string
          locale?: string | null
          membership_status?: string | null
          membership_type?: string | null
          notification_prefs?: Json | null
          onboarding_completed_at?: string | null
          patient_flag?: boolean | null
          phone?: string | null
          postcode?: string | null
          preferred_name?: string | null
          profile_photo_url?: string | null
          slsa_member_number?: string | null
          suburb?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          auth_user_id?: string | null
          club_id?: string
          country?: string | null
          created_at?: string | null
          crew_flag?: boolean | null
          date_of_birth?: string | null
          driver_flag?: boolean | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          join_date?: string | null
          last_active_at?: string | null
          last_name?: string
          locale?: string | null
          membership_status?: string | null
          membership_type?: string | null
          notification_prefs?: Json | null
          onboarding_completed_at?: string | null
          patient_flag?: boolean | null
          phone?: string | null
          postcode?: string | null
          preferred_name?: string | null
          profile_photo_url?: string | null
          slsa_member_number?: string | null
          suburb?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      nipper_enrollments: {
        Row: {
          club_id: string
          enrolled_date: string | null
          group_id: string
          id: string
          medical_notes: string | null
          member_id: string
          parent_email: string | null
          parent_member_id: string | null
          parent_name: string | null
          parent_phone: string | null
          season: string
        }
        Insert: {
          club_id: string
          enrolled_date?: string | null
          group_id: string
          id?: string
          medical_notes?: string | null
          member_id: string
          parent_email?: string | null
          parent_member_id?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          season: string
        }
        Update: {
          club_id?: string
          enrolled_date?: string | null
          group_id?: string
          id?: string
          medical_notes?: string | null
          member_id?: string
          parent_email?: string | null
          parent_member_id?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          season?: string
        }
        Relationships: [
          {
            foreignKeyName: "nipper_enrollments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nipper_enrollments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "nipper_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nipper_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nipper_enrollments_parent_member_id_fkey"
            columns: ["parent_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      nipper_groups: {
        Row: {
          club_id: string
          coach_id: string | null
          created_at: string | null
          group_name: string
          id: string
          is_active: boolean | null
          max_age: number | null
          min_age: number | null
          season: string
        }
        Insert: {
          club_id: string
          coach_id?: string | null
          created_at?: string | null
          group_name: string
          id?: string
          is_active?: boolean | null
          max_age?: number | null
          min_age?: number | null
          season: string
        }
        Update: {
          club_id?: string
          coach_id?: string | null
          created_at?: string | null
          group_name?: string
          id?: string
          is_active?: boolean | null
          max_age?: number | null
          min_age?: number | null
          season?: string
        }
        Relationships: [
          {
            foreignKeyName: "nipper_groups_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nipper_groups_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          club_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          member_id: string
          message: string
          notification_type: string
          related_id: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          member_id: string
          message: string
          notification_type: string
          related_id?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          member_id?: string
          message?: string
          notification_type?: string
          related_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      patrol_attendance: {
        Row: {
          attended: boolean | null
          club_id: string
          id: string
          member_id: string
          notes: string | null
          session_id: string
          substitute_for: string | null
        }
        Insert: {
          attended?: boolean | null
          club_id: string
          id?: string
          member_id: string
          notes?: string | null
          session_id: string
          substitute_for?: string | null
        }
        Update: {
          attended?: boolean | null
          club_id?: string
          id?: string
          member_id?: string
          notes?: string | null
          session_id?: string
          substitute_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrol_attendance_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "patrol_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_attendance_substitute_for_fkey"
            columns: ["substitute_for"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      patrol_members: {
        Row: {
          club_id: string
          id: string
          joined_patrol_date: string | null
          member_id: string
          patrol_id: string
          role_on_patrol: string | null
        }
        Insert: {
          club_id: string
          id?: string
          joined_patrol_date?: string | null
          member_id: string
          patrol_id: string
          role_on_patrol?: string | null
        }
        Update: {
          club_id?: string
          id?: string
          joined_patrol_date?: string | null
          member_id?: string
          patrol_id?: string
          role_on_patrol?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrol_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_members_patrol_id_fkey"
            columns: ["patrol_id"]
            isOneToOne: false
            referencedRelation: "patrols"
            referencedColumns: ["id"]
          },
        ]
      }
      patrol_sessions: {
        Row: {
          club_id: string
          conditions: string | null
          created_at: string | null
          end_time: string | null
          id: string
          notes: string | null
          patrol_date: string
          patrol_id: string
          session_status: string | null
          start_time: string | null
          weather: string | null
        }
        Insert: {
          club_id: string
          conditions?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          patrol_date: string
          patrol_id: string
          session_status?: string | null
          start_time?: string | null
          weather?: string | null
        }
        Update: {
          club_id?: string
          conditions?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          notes?: string | null
          patrol_date?: string
          patrol_id?: string
          session_status?: string | null
          start_time?: string | null
          weather?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrol_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrol_sessions_patrol_id_fkey"
            columns: ["patrol_id"]
            isOneToOne: false
            referencedRelation: "patrols"
            referencedColumns: ["id"]
          },
        ]
      }
      patrols: {
        Row: {
          club_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          patrol_captain_id: string | null
          patrol_name: string
          season: string
          vice_captain_id: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          patrol_captain_id?: string | null
          patrol_name: string
          season: string
          vice_captain_id?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          patrol_captain_id?: string | null
          patrol_name?: string
          season?: string
          vice_captain_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patrols_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrols_patrol_captain_id_fkey"
            columns: ["patrol_captain_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patrols_vice_captain_id_fkey"
            columns: ["vice_captain_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string | null
          email: string
          id: string
          member_id: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          member_id?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          member_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_owners: {
        Row: {
          created_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          is_active: boolean | null
          member_id: string
          notes: string | null
          role: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          member_id: string
          notes?: string | null
          role?: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          is_active?: boolean | null
          member_id?: string
          notes?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_identity: {
        Row: {
          created_at: string
          date_of_birth: string | null
          passport_expiry: string | null
          passport_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_division: Database["public"]["Enums"]["age_division"] | null
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          nationality: string | null
          phone: string | null
          preferred_roles: string[]
          updated_at: string
        }
        Insert: {
          age_division?: Database["public"]["Enums"]["age_division"] | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id: string
          last_name?: string | null
          nationality?: string | null
          phone?: string | null
          preferred_roles?: string[]
          updated_at?: string
        }
        Update: {
          age_division?: Database["public"]["Enums"]["age_division"] | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          nationality?: string | null
          phone?: string | null
          preferred_roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      qualifications: {
        Row: {
          category: string
          code: string
          country: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          renewal_notice_days: number | null
          validity_years: number | null
        }
        Insert: {
          category: string
          code: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          renewal_notice_days?: number | null
          validity_years?: number | null
        }
        Update: {
          category?: string
          code?: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          renewal_notice_days?: number | null
          validity_years?: number | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          club_id: string
          id: string
          is_active: boolean | null
          member_id: string
          role_name: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          club_id: string
          id?: string
          is_active?: boolean | null
          member_id: string
          role_name: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          club_id?: string
          id?: string
          is_active?: boolean | null
          member_id?: string
          role_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      session_attendance: {
        Row: {
          created_at: string
          id: string
          marked_at: string
          marked_by: string | null
          note: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_at?: string
          marked_by?: string | null
          note?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_club_vehicles: {
        Row: {
          can_tow: boolean
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          pickup_location: string | null
          seats: number
          session_id: string
          updated_at: string
        }
        Insert: {
          can_tow?: boolean
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          pickup_location?: string | null
          seats?: number
          session_id: string
          updated_at?: string
        }
        Update: {
          can_tow?: boolean
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          pickup_location?: string | null
          seats?: number
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_draw_configs: {
        Row: {
          created_at: string
          lanes_count: number
          session_id: string
          updated_at: string
          updated_by: string | null
          waves_count: number
        }
        Insert: {
          created_at?: string
          lanes_count?: number
          session_id: string
          updated_at?: string
          updated_by?: string | null
          waves_count?: number
        }
        Update: {
          created_at?: string
          lanes_count?: number
          session_id?: string
          updated_at?: string
          updated_by?: string | null
          waves_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_draw_configs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_draw_configs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_equipment: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          equipment_id: string
          id: string
          notes: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          equipment_id: string
          id?: string
          notes?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          equipment_id?: string
          id?: string
          notes?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_equipment_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_rsvps: {
        Row: {
          created_at: string
          id: string
          member_id: string | null
          note: string | null
          session_id: string
          status: Database["public"]["Enums"]["rsvp_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          member_id?: string | null
          note?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string | null
          note?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_rsvps_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_rsvps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_survey_questions: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          options: Json | null
          position: number
          question_text: string
          question_type: string
          required: boolean
          session_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          options?: Json | null
          position?: number
          question_text: string
          question_type?: string
          required?: boolean
          session_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          options?: Json | null
          position?: number
          question_text?: string
          question_type?: string
          required?: boolean
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_survey_questions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_survey_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_survey_responses: {
        Row: {
          answer_bool: boolean | null
          answer_choice: string | null
          answer_text: string | null
          club_id: string
          created_at: string
          id: string
          question_id: string
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_bool?: boolean | null
          answer_choice?: string | null
          answer_text?: string | null
          club_id: string
          created_at?: string
          id?: string
          question_id: string
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_bool?: boolean | null
          answer_choice?: string | null
          answer_text?: string | null
          club_id?: string
          created_at?: string
          id?: string
          question_id?: string
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_survey_responses_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_survey_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "session_survey_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_survey_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_teams: {
        Row: {
          created_at: string
          crew_id: string | null
          driver_id: string | null
          id: string
          lane: number | null
          notes: string | null
          patient_id: string | null
          session_id: string
          updated_at: string
          wave: number | null
          wave_name: string | null
        }
        Insert: {
          created_at?: string
          crew_id?: string | null
          driver_id?: string | null
          id?: string
          lane?: number | null
          notes?: string | null
          patient_id?: string | null
          session_id: string
          updated_at?: string
          wave?: number | null
          wave_name?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string | null
          driver_id?: string | null
          id?: string
          lane?: number | null
          notes?: string | null
          patient_id?: string | null
          session_id?: string
          updated_at?: string
          wave?: number | null
          wave_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_teams_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_teams_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_teams_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      session_training_blocks: {
        Row: {
          club_id: string
          created_at: string
          drill_id: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          plan_id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          drill_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          plan_id: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          drill_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          plan_id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_training_blocks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_training_blocks_drill_id_fkey"
            columns: ["drill_id"]
            isOneToOne: false
            referencedRelation: "training_drills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_training_blocks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "session_training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      session_training_plans: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          id: string
          overview: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          overview?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          overview?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_training_plans_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_training_plans_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          capacity: number | null
          carpool_enabled: boolean
          carpool_pickups: string[]
          club_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          format: Database["public"]["Enums"]["session_format"]
          id: string
          location: string | null
          location_id: string | null
          notes: string | null
          repeat_frequency: Database["public"]["Enums"]["repeat_frequency"]
          rsvp_deadline: string | null
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          survey_enabled: boolean
          title: string
          trailers_required: number
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          carpool_enabled?: boolean
          carpool_pickups?: string[]
          club_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          format?: Database["public"]["Enums"]["session_format"]
          id?: string
          location?: string | null
          location_id?: string | null
          notes?: string | null
          repeat_frequency?: Database["public"]["Enums"]["repeat_frequency"]
          rsvp_deadline?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          starts_at: string
          survey_enabled?: boolean
          title: string
          trailers_required?: number
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          carpool_enabled?: boolean
          carpool_pickups?: string[]
          club_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          format?: Database["public"]["Enums"]["session_format"]
          id?: string
          location?: string | null
          location_id?: string | null
          notes?: string | null
          repeat_frequency?: Database["public"]["Enums"]["repeat_frequency"]
          rsvp_deadline?: string | null
          session_type?: Database["public"]["Enums"]["session_type"]
          starts_at?: string
          survey_enabled?: boolean
          title?: string
          trailers_required?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_templates: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          questions: Json
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          questions?: Json
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          questions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_drills: {
        Row: {
          club_id: string
          created_at: string
          created_by: string | null
          default_duration_minutes: number | null
          description: string | null
          id: string
          name: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          created_by?: string | null
          default_duration_minutes?: number | null
          description?: string | null
          id?: string
          name: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          created_by?: string | null
          default_duration_minutes?: number | null
          description?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_drills_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_enrollments: {
        Row: {
          assessor_id: string | null
          attendance_status: string | null
          club_id: string
          enrolled_at: string | null
          id: string
          member_id: string
          notes: string | null
          result: string | null
          session_id: string
        }
        Insert: {
          assessor_id?: string | null
          attendance_status?: string | null
          club_id: string
          enrolled_at?: string | null
          id?: string
          member_id: string
          notes?: string | null
          result?: string | null
          session_id: string
        }
        Update: {
          assessor_id?: string | null
          attendance_status?: string | null
          club_id?: string
          enrolled_at?: string | null
          id?: string
          member_id?: string
          notes?: string | null
          result?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_enrollments_assessor_id_fkey"
            columns: ["assessor_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_enrollments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_enrollments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plan_templates: {
        Row: {
          blocks: Json
          club_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          club_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          club_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plan_templates_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          club_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          location: string | null
          max_participants: number | null
          notes: string | null
          qualification_id: string | null
          scheduled_date: string
          session_type: string
          start_time: string | null
          status: string | null
          title: string
          trainer_id: string | null
          updated_at: string | null
        }
        Insert: {
          club_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          max_participants?: number | null
          notes?: string | null
          qualification_id?: string | null
          scheduled_date: string
          session_type: string
          start_time?: string | null
          status?: string | null
          title: string
          trainer_id?: string | null
          updated_at?: string | null
        }
        Update: {
          club_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          max_participants?: number | null
          notes?: string | null
          qualification_id?: string | null
          scheduled_date?: string
          session_type?: string
          start_time?: string | null
          status?: string | null
          title?: string
          trainer_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_qualification_id_fkey"
            columns: ["qualification_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_club_role: {
        Args: {
          _club_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      bootstrap_platform_owner: { Args: never; Returns: string }
      coach_can: {
        Args: { _club_id: string; _perm: string; _user_id: string }
        Returns: boolean
      }
      get_my_club_id: { Args: never; Returns: string }
      get_platform_stats: { Args: never; Returns: Json }
      grant_platform_owner: { Args: { _email: string }; Returns: string }
      has_role:
        | {
            Args: {
              _club_id: string
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { check_role: string }; Returns: boolean }
      is_approved_member: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_admin: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_owner: { Args: { _user_id: string }; Returns: boolean }
      list_platform_coaches: {
        Args: never
        Returns: {
          club_id: string
          club_name: string
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      list_platform_owners: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      log_audit: {
        Args: {
          _action: string
          _club_id: string
          _details: Json
          _target_user_id: string
        }
        Returns: undefined
      }
      member_completed_pretraining_survey: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
      redeem_club_invite_code: { Args: { _code: string }; Returns: string }
      revoke_club_role: {
        Args: {
          _club_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      revoke_platform_owner: { Args: { _user_id: string }; Returns: undefined }
      update_coach_permissions:
        | {
            Args: {
              _club_id: string
              _manage_attendance: boolean
              _manage_documents: boolean
              _manage_equipment: boolean
              _manage_member_rsvps: boolean
              _manage_waves: boolean
              _view_emergency: boolean
              _view_medical: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              _club_id: string
              _manage_attendance: boolean
              _manage_documents: boolean
              _manage_equipment: boolean
              _manage_member_rsvps: boolean
              _manage_templates?: boolean
              _manage_training_plans?: boolean
              _manage_waves: boolean
              _view_emergency: boolean
              _view_medical: boolean
              _view_survey_results?: boolean
            }
            Returns: undefined
          }
    }
    Enums: {
      age_division: "u23" | "open" | "masters_35" | "masters_45"
      app_role: "owner" | "club_admin" | "coach" | "member"
      attendance_status: "present" | "absent" | "excused" | "injured"
      carpool_request_status: "pending" | "assigned" | "cancelled"
      carpool_status: "open" | "full" | "cancelled"
      equipment_status: "active" | "retired"
      fault_status: "open" | "repaired" | "cleared"
      membership_status: "pending" | "approved" | "rejected"
      repeat_frequency: "none" | "daily" | "weekly" | "fortnightly" | "monthly"
      rsvp_status: "going" | "maybe" | "not_going"
      session_format: "team" | "individual"
      session_type: "training" | "fitness" | "theory" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      age_division: ["u23", "open", "masters_35", "masters_45"],
      app_role: ["owner", "club_admin", "coach", "member"],
      attendance_status: ["present", "absent", "excused", "injured"],
      carpool_request_status: ["pending", "assigned", "cancelled"],
      carpool_status: ["open", "full", "cancelled"],
      equipment_status: ["active", "retired"],
      fault_status: ["open", "repaired", "cleared"],
      membership_status: ["pending", "approved", "rejected"],
      repeat_frequency: ["none", "daily", "weekly", "fortnightly", "monthly"],
      rsvp_status: ["going", "maybe", "not_going"],
      session_format: ["team", "individual"],
      session_type: ["training", "fitness", "theory", "other"],
    },
  },
} as const
