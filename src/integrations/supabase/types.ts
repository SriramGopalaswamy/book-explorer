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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_alerts: {
        Row: {
          alert_type: string
          amount: number | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_resolved: boolean
          metadata: Json | null
          organization_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          amount?: number | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_resolved?: boolean
          metadata?: Json | null
          organization_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          amount?: number | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_resolved?: boolean
          metadata?: Json | null
          organization_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_calibration: {
        Row: {
          avg_ticket_size: number | null
          employee_count: number | null
          id: string
          initialized_at: string
          monthly_revenue_range: string | null
          organization_id: string
          revenue_model: string | null
          updated_at: string
        }
        Insert: {
          avg_ticket_size?: number | null
          employee_count?: number | null
          id?: string
          initialized_at?: string
          monthly_revenue_range?: string | null
          organization_id: string
          revenue_model?: string | null
          updated_at?: string
        }
        Update: {
          avg_ticket_size?: number | null
          employee_count?: number | null
          id?: string
          initialized_at?: string
          monthly_revenue_range?: string | null
          organization_id?: string
          revenue_model?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_calibration_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_customer_profiles: {
        Row: {
          avg_payment_days: number | null
          created_at: string
          customer_id: string
          id: string
          last_payment_date: string | null
          lifetime_value: number | null
          metadata: Json | null
          organization_id: string
          overdue_amount: number | null
          overdue_invoices_count: number | null
          risk_score: number
          trend: string | null
          updated_at: string
        }
        Insert: {
          avg_payment_days?: number | null
          created_at?: string
          customer_id: string
          id?: string
          last_payment_date?: string | null
          lifetime_value?: number | null
          metadata?: Json | null
          organization_id: string
          overdue_amount?: number | null
          overdue_invoices_count?: number | null
          risk_score?: number
          trend?: string | null
          updated_at?: string
        }
        Update: {
          avg_payment_days?: number | null
          created_at?: string
          customer_id?: string
          id?: string
          last_payment_date?: string | null
          lifetime_value?: number | null
          metadata?: Json | null
          organization_id?: string
          overdue_amount?: number | null
          overdue_invoices_count?: number | null
          risk_score?: number
          trend?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_customer_profiles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_customer_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_financial_snapshots: {
        Row: {
          burn_rate_daily: number | null
          cash_position: number
          created_at: string
          expenses_30d: number | null
          health_score: number
          id: string
          metadata: Json | null
          net_margin_pct: number | null
          organization_id: string
          payables_overdue: number | null
          payables_total: number | null
          receivables_overdue: number | null
          receivables_total: number | null
          revenue_30d: number | null
          runway_days: number | null
          snapshot_date: string
          updated_at: string
        }
        Insert: {
          burn_rate_daily?: number | null
          cash_position?: number
          created_at?: string
          expenses_30d?: number | null
          health_score?: number
          id?: string
          metadata?: Json | null
          net_margin_pct?: number | null
          organization_id: string
          payables_overdue?: number | null
          payables_total?: number | null
          receivables_overdue?: number | null
          receivables_total?: number | null
          revenue_30d?: number | null
          runway_days?: number | null
          snapshot_date?: string
          updated_at?: string
        }
        Update: {
          burn_rate_daily?: number | null
          cash_position?: number
          created_at?: string
          expenses_30d?: number | null
          health_score?: number
          id?: string
          metadata?: Json | null
          net_margin_pct?: number | null
          organization_id?: string
          payables_overdue?: number | null
          payables_total?: number | null
          receivables_overdue?: number | null
          receivables_total?: number | null
          revenue_30d?: number | null
          runway_days?: number | null
          snapshot_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_financial_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_risk_scores: {
        Row: {
          cash_risk: number
          compliance_risk: number
          created_at: string
          id: string
          margin_risk: number
          metadata: Json | null
          organization_id: string
          overall_risk: number
          receivables_risk: number
          score_date: string
          updated_at: string
        }
        Insert: {
          cash_risk?: number
          compliance_risk?: number
          created_at?: string
          id?: string
          margin_risk?: number
          metadata?: Json | null
          organization_id: string
          overall_risk?: number
          receivables_risk?: number
          score_date?: string
          updated_at?: string
        }
        Update: {
          cash_risk?: number
          compliance_risk?: number
          created_at?: string
          id?: string
          margin_risk?: number
          metadata?: Json | null
          organization_id?: string
          overall_risk?: number
          receivables_risk?: number
          score_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_risk_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_vendor_profiles: {
        Row: {
          avg_delivery_days: number | null
          created_at: string
          dispute_count: number | null
          id: string
          last_bill_date: string | null
          metadata: Json | null
          organization_id: string
          reliability_score: number
          total_spend: number | null
          trend: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          avg_delivery_days?: number | null
          created_at?: string
          dispute_count?: number | null
          id?: string
          last_bill_date?: string | null
          metadata?: Json | null
          organization_id: string
          reliability_score?: number
          total_spend?: number | null
          trend?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          avg_delivery_days?: number | null
          created_at?: string
          dispute_count?: number | null
          id?: string
          last_bill_date?: string | null
          metadata?: Json | null
          organization_id?: string
          reliability_score?: number
          total_spend?: number | null
          trend?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_vendor_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_vendor_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          current_step: number
          document_amount: number | null
          document_id: string
          document_number: string | null
          document_type: string
          id: string
          notes: string | null
          organization_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          status: string
          total_steps: number
          updated_at: string
          workflow_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_step?: number
          document_amount?: number | null
          document_id: string
          document_number?: string | null
          document_type: string
          id?: string
          notes?: string | null
          organization_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          status?: string
          total_steps?: number
          updated_at?: string
          workflow_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_step?: number
          document_amount?: number | null
          document_id?: string
          document_number?: string | null
          document_type?: string
          id?: string
          notes?: string | null
          organization_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          status?: string
          total_steps?: number
          updated_at?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflow_steps: {
        Row: {
          created_at: string
          id: string
          required_role: string
          step_order: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          required_role?: string
          step_order?: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          id?: string
          required_role?: string
          step_order?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          required_role: string
          threshold_amount: number
          workflow_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          required_role?: string
          threshold_amount?: number
          workflow_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          required_role?: string
          threshold_amount?: number
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_depreciation_entries: {
        Row: {
          accumulated_depreciation: number
          asset_id: string
          book_value_after: number
          created_at: string
          depreciation_amount: number
          financial_record_id: string | null
          id: string
          is_posted: boolean
          notes: string | null
          organization_id: string
          period_date: string
        }
        Insert: {
          accumulated_depreciation?: number
          asset_id: string
          book_value_after?: number
          created_at?: string
          depreciation_amount?: number
          financial_record_id?: string | null
          id?: string
          is_posted?: boolean
          notes?: string | null
          organization_id?: string
          period_date: string
        }
        Update: {
          accumulated_depreciation?: number
          asset_id?: string
          book_value_after?: number
          created_at?: string
          depreciation_amount?: number
          financial_record_id?: string | null
          id?: string
          is_posted?: boolean
          notes?: string | null
          organization_id?: string
          period_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciation_entries_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ade_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          accumulated_depreciation: number
          asset_tag: string
          assigned_to: string | null
          barcode: string | null
          bill_id: string | null
          category: string
          condition: string
          created_at: string
          current_book_value: number
          custodian: string | null
          department: string | null
          depreciation_method: string
          depreciation_start_date: string | null
          description: string | null
          disposal_date: string | null
          disposal_method: string | null
          disposal_notes: string | null
          disposal_price: number | null
          id: string
          insurance_expiry: string | null
          insurance_policy: string | null
          last_tagged_by: string | null
          last_tagged_date: string | null
          location: string | null
          manufacturer: string | null
          model_number: string | null
          name: string
          notes: string | null
          organization_id: string
          po_number: string | null
          purchase_date: string
          purchase_price: number
          salvage_value: number
          serial_number: string | null
          status: string
          sub_category: string | null
          tag_verified: boolean
          updated_at: string
          useful_life_months: number
          user_id: string
          vendor_id: string | null
          warranty_expiry: string | null
          warranty_provider: string | null
        }
        Insert: {
          accumulated_depreciation?: number
          asset_tag: string
          assigned_to?: string | null
          barcode?: string | null
          bill_id?: string | null
          category?: string
          condition?: string
          created_at?: string
          current_book_value?: number
          custodian?: string | null
          department?: string | null
          depreciation_method?: string
          depreciation_start_date?: string | null
          description?: string | null
          disposal_date?: string | null
          disposal_method?: string | null
          disposal_notes?: string | null
          disposal_price?: number | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy?: string | null
          last_tagged_by?: string | null
          last_tagged_date?: string | null
          location?: string | null
          manufacturer?: string | null
          model_number?: string | null
          name: string
          notes?: string | null
          organization_id?: string
          po_number?: string | null
          purchase_date?: string
          purchase_price?: number
          salvage_value?: number
          serial_number?: string | null
          status?: string
          sub_category?: string | null
          tag_verified?: boolean
          updated_at?: string
          useful_life_months?: number
          user_id: string
          vendor_id?: string | null
          warranty_expiry?: string | null
          warranty_provider?: string | null
        }
        Update: {
          accumulated_depreciation?: number
          asset_tag?: string
          assigned_to?: string | null
          barcode?: string | null
          bill_id?: string | null
          category?: string
          condition?: string
          created_at?: string
          current_book_value?: number
          custodian?: string | null
          department?: string | null
          depreciation_method?: string
          depreciation_start_date?: string | null
          description?: string | null
          disposal_date?: string | null
          disposal_method?: string | null
          disposal_notes?: string | null
          disposal_price?: number | null
          id?: string
          insurance_expiry?: string | null
          insurance_policy?: string | null
          last_tagged_by?: string | null
          last_tagged_date?: string | null
          location?: string | null
          manufacturer?: string | null
          model_number?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          po_number?: string | null
          purchase_date?: string
          purchase_price?: number
          salvage_value?: number
          serial_number?: string | null
          status?: string
          sub_category?: string | null
          tag_verified?: boolean
          updated_at?: string
          useful_life_months?: number
          user_id?: string
          vendor_id?: string | null
          warranty_expiry?: string | null
          warranty_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_assets_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_correction_requests: {
        Row: {
          created_at: string
          date: string
          id: string
          organization_id: string
          profile_id: string | null
          reason: string
          requested_check_in: string | null
          requested_check_out: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          organization_id?: string
          profile_id?: string | null
          reason: string
          requested_check_in?: string | null
          requested_check_out?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
          profile_id?: string | null
          reason?: string
          requested_check_in?: string | null
          requested_check_out?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_correction_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_acr_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_daily: {
        Row: {
          attendance_date: string
          calculated_from: string | null
          created_at: string
          early_exit_minutes: number
          first_in_time: string | null
          id: string
          last_out_time: string | null
          late_minutes: number
          locked: boolean
          organization_id: string
          ot_minutes: number
          profile_id: string
          shift_id: string | null
          status: string
          total_work_minutes: number
          updated_at: string
        }
        Insert: {
          attendance_date: string
          calculated_from?: string | null
          created_at?: string
          early_exit_minutes?: number
          first_in_time?: string | null
          id?: string
          last_out_time?: string | null
          late_minutes?: number
          locked?: boolean
          organization_id: string
          ot_minutes?: number
          profile_id: string
          shift_id?: string | null
          status?: string
          total_work_minutes?: number
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          calculated_from?: string | null
          created_at?: string
          early_exit_minutes?: number
          first_in_time?: string | null
          id?: string
          last_out_time?: string | null
          late_minutes?: number
          locked?: boolean
          organization_id?: string
          ot_minutes?: number
          profile_id?: string
          shift_id?: string | null
          status?: string
          total_work_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "attendance_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_parse_diagnostics: {
        Row: {
          created_at: string | null
          file_name: string | null
          id: string
          metrics: Json | null
          organization_id: string
          raw_excerpt: string | null
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          metrics?: Json | null
          organization_id: string
          raw_excerpt?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          id?: string
          metrics?: Json | null
          organization_id?: string
          raw_excerpt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_parse_diagnostics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_punches: {
        Row: {
          card_no: string | null
          created_at: string
          employee_code: string
          id: string
          organization_id: string
          profile_id: string
          punch_datetime: string
          punch_source: string
          raw_status: string | null
          upload_batch_id: string | null
        }
        Insert: {
          card_no?: string | null
          created_at?: string
          employee_code: string
          id?: string
          organization_id: string
          profile_id: string
          punch_datetime: string
          punch_source?: string
          raw_status?: string | null
          upload_batch_id?: string | null
        }
        Update: {
          card_no?: string | null
          created_at?: string
          employee_code?: string
          id?: string
          organization_id?: string
          profile_id?: string
          punch_datetime?: string
          punch_source?: string
          raw_status?: string | null
          upload_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_punches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_punches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          organization_id: string
          profile_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_attendance_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_shifts: {
        Row: {
          created_at: string
          end_time: string
          full_day_minutes: number
          grace_minutes: number
          id: string
          is_default: boolean
          min_half_day_minutes: number
          name: string
          organization_id: string
          ot_after_minutes: number
          start_time: string
        }
        Insert: {
          created_at?: string
          end_time: string
          full_day_minutes?: number
          grace_minutes?: number
          id?: string
          is_default?: boolean
          min_half_day_minutes?: number
          name: string
          organization_id: string
          ot_after_minutes?: number
          start_time: string
        }
        Update: {
          created_at?: string
          end_time?: string
          full_day_minutes?: number
          grace_minutes?: number
          id?: string
          is_default?: boolean
          min_half_day_minutes?: number
          name?: string
          organization_id?: string
          ot_after_minutes?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_upload_logs: {
        Row: {
          created_at: string
          duplicate_punches: number
          file_name: string
          file_type: string
          id: string
          matched_employees: number
          organization_id: string
          parse_errors: string[] | null
          status: string
          total_punches: number
          unmatched_codes: string[] | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          duplicate_punches?: number
          file_name: string
          file_type?: string
          id?: string
          matched_employees?: number
          organization_id: string
          parse_errors?: string[] | null
          status?: string
          total_punches?: number
          unmatched_codes?: string[] | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          duplicate_punches?: number
          file_name?: string
          file_type?: string
          id?: string
          matched_employees?: number
          organization_id?: string
          parse_errors?: string[] | null
          status?: string
          total_punches?: number
          unmatched_codes?: string[] | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_upload_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_ai_anomalies: {
        Row: {
          anomaly_type: string
          confidence_score: number | null
          created_at: string
          current_value: number | null
          data_reference: Json | null
          deviation_pct: number | null
          id: string
          last_year_value: number | null
          organization_id: string
          risk_score: number
          run_id: string
          suggested_audit_action: string | null
          theme_id: string | null
          trigger_condition: string
        }
        Insert: {
          anomaly_type: string
          confidence_score?: number | null
          created_at?: string
          current_value?: number | null
          data_reference?: Json | null
          deviation_pct?: number | null
          id?: string
          last_year_value?: number | null
          organization_id: string
          risk_score?: number
          run_id: string
          suggested_audit_action?: string | null
          theme_id?: string | null
          trigger_condition: string
        }
        Update: {
          anomaly_type?: string
          confidence_score?: number | null
          created_at?: string
          current_value?: number | null
          data_reference?: Json | null
          deviation_pct?: number | null
          id?: string
          last_year_value?: number | null
          organization_id?: string
          risk_score?: number
          run_id?: string
          suggested_audit_action?: string | null
          theme_id?: string | null
          trigger_condition?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_ai_anomalies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_ai_anomalies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_ai_anomalies_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "audit_risk_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_ai_narratives: {
        Row: {
          content: string
          created_at: string
          data_points: Json | null
          financial_year: string
          generated_at: string
          id: string
          narrative_type: string
          organization_id: string
          run_id: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          data_points?: Json | null
          financial_year: string
          generated_at?: string
          id?: string
          narrative_type: string
          organization_id: string
          run_id: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          data_points?: Json | null
          financial_year?: string
          generated_at?: string
          id?: string
          narrative_type?: string
          organization_id?: string
          run_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_ai_narratives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_ai_narratives_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_ai_samples: {
        Row: {
          amount: number | null
          created_at: string
          entity_id: string
          entity_reference: string | null
          entity_type: string
          id: string
          is_accepted: boolean | null
          metadata: Json | null
          organization_id: string
          reason_selected: string
          risk_weight: number | null
          run_id: string
          sample_name: string
          sample_type: string
          transaction_date: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          entity_id: string
          entity_reference?: string | null
          entity_type: string
          id?: string
          is_accepted?: boolean | null
          metadata?: Json | null
          organization_id: string
          reason_selected: string
          risk_weight?: number | null
          run_id: string
          sample_name: string
          sample_type: string
          transaction_date?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          entity_id?: string
          entity_reference?: string | null
          entity_type?: string
          id?: string
          is_accepted?: boolean | null
          metadata?: Json | null
          organization_id?: string
          reason_selected?: string
          risk_weight?: number | null
          run_id?: string
          sample_name?: string
          sample_type?: string
          transaction_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_ai_samples_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_ai_samples_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_compliance_checks: {
        Row: {
          affected_amount: number | null
          affected_count: number | null
          check_code: string
          check_name: string
          created_at: string
          data_references: Json | null
          details: Json | null
          id: string
          module: string
          organization_id: string
          recommendation: string | null
          run_id: string
          severity: string
          status: string
        }
        Insert: {
          affected_amount?: number | null
          affected_count?: number | null
          check_code: string
          check_name: string
          created_at?: string
          data_references?: Json | null
          details?: Json | null
          id?: string
          module: string
          organization_id: string
          recommendation?: string | null
          run_id: string
          severity?: string
          status?: string
        }
        Update: {
          affected_amount?: number | null
          affected_count?: number | null
          check_code?: string
          check_name?: string
          created_at?: string
          data_references?: Json | null
          details?: Json | null
          id?: string
          module?: string
          organization_id?: string
          recommendation?: string | null
          run_id?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_compliance_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_compliance_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_compliance_runs: {
        Row: {
          ai_risk_index: number | null
          completed_at: string | null
          compliance_score: number | null
          created_at: string
          financial_year: string
          id: string
          ifc_rating: string | null
          organization_id: string
          risk_breakdown: Json | null
          run_by: string
          run_type: string
          score_breakdown: Json | null
          started_at: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          ai_risk_index?: number | null
          completed_at?: string | null
          compliance_score?: number | null
          created_at?: string
          financial_year: string
          id?: string
          ifc_rating?: string | null
          organization_id: string
          risk_breakdown?: Json | null
          run_by: string
          run_type?: string
          score_breakdown?: Json | null
          started_at?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          ai_risk_index?: number | null
          completed_at?: string | null
          compliance_score?: number | null
          created_at?: string
          financial_year?: string
          id?: string
          ifc_rating?: string | null
          organization_id?: string
          risk_breakdown?: Json | null
          run_by?: string
          run_type?: string
          score_breakdown?: Json | null
          started_at?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_compliance_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_ifc_assessments: {
        Row: {
          affected_count: number | null
          affected_user_ids: string[] | null
          check_name: string
          check_type: string
          created_at: string
          details: Json | null
          id: string
          organization_id: string
          recommendation: string | null
          run_id: string
          severity: string
          status: string
        }
        Insert: {
          affected_count?: number | null
          affected_user_ids?: string[] | null
          check_name: string
          check_type: string
          created_at?: string
          details?: Json | null
          id?: string
          organization_id: string
          recommendation?: string | null
          run_id: string
          severity?: string
          status?: string
        }
        Update: {
          affected_count?: number | null
          affected_user_ids?: string[] | null
          check_name?: string
          check_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
          recommendation?: string | null
          run_id?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_ifc_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_ifc_assessments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_name: string | null
          actor_role: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string
          target_name: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          target_name?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          target_name?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_audit_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_pack_exports: {
        Row: {
          created_at: string
          export_type: string
          exported_by: string
          file_url: string | null
          financial_year: string
          id: string
          metadata: Json | null
          organization_id: string
          run_id: string | null
          sections_included: string[] | null
          status: string
        }
        Insert: {
          created_at?: string
          export_type?: string
          exported_by: string
          file_url?: string | null
          financial_year: string
          id?: string
          metadata?: Json | null
          organization_id: string
          run_id?: string | null
          sections_included?: string[] | null
          status?: string
        }
        Update: {
          created_at?: string
          export_type?: string
          exported_by?: string
          file_url?: string | null
          financial_year?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          run_id?: string | null
          sections_included?: string[] | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_pack_exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_pack_exports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_risk_themes: {
        Row: {
          confidence_score: number
          contributing_flags: Json | null
          created_at: string
          explanation: string | null
          historical_comparison: Json | null
          id: string
          impact_area: string
          impacted_value: number | null
          organization_id: string
          risk_score: number
          run_id: string
          suggested_action: string | null
          theme_name: string
          transaction_count: number | null
        }
        Insert: {
          confidence_score?: number
          contributing_flags?: Json | null
          created_at?: string
          explanation?: string | null
          historical_comparison?: Json | null
          id?: string
          impact_area: string
          impacted_value?: number | null
          organization_id: string
          risk_score?: number
          run_id: string
          suggested_action?: string | null
          theme_name: string
          transaction_count?: number | null
        }
        Update: {
          confidence_score?: number
          contributing_flags?: Json | null
          created_at?: string
          explanation?: string | null
          historical_comparison?: Json | null
          id?: string
          impact_area?: string
          impacted_value?: number | null
          organization_id?: string
          risk_score?: number
          run_id?: string
          suggested_action?: string | null
          theme_name?: string
          transaction_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_risk_themes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_risk_themes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "audit_compliance_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string
          account_type: string
          balance: number
          bank_name: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number: string
          account_type?: string
          balance?: number
          bank_name?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string
          account_type?: string
          balance?: number
          bank_name?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_acct_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string | null
          ai_match_id: string | null
          ai_match_type: string | null
          ai_suggested_category: string | null
          amount: number
          category: string | null
          created_at: string
          description: string
          id: string
          is_duplicate_flag: boolean | null
          organization_id: string
          reconcile_status: string | null
          reconciled: boolean | null
          reconciled_at: string | null
          reference: string | null
          transaction_date: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_match_id?: string | null
          ai_match_type?: string | null
          ai_suggested_category?: string | null
          amount: number
          category?: string | null
          created_at?: string
          description: string
          id?: string
          is_duplicate_flag?: boolean | null
          organization_id?: string
          reconcile_status?: string | null
          reconciled?: boolean | null
          reconciled_at?: string | null
          reference?: string | null
          transaction_date?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_match_id?: string | null
          ai_match_type?: string | null
          ai_suggested_category?: string | null
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          is_duplicate_flag?: boolean | null
          organization_id?: string
          reconcile_status?: string | null
          reconciled?: boolean | null
          reconciled_at?: string | null
          reference?: string | null
          transaction_date?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_txn_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transfer_batches: {
        Row: {
          bank_format_type: string
          created_at: string | null
          file_url: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          organization_id: string
          payroll_run_id: string
        }
        Insert: {
          bank_format_type?: string
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          organization_id: string
          payroll_run_id: string
        }
        Update: {
          bank_format_type?: string
          created_at?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          organization_id?: string
          payroll_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transfer_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transfer_batches_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          description: string
          id: string
          quantity: number
          rate: number
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          description: string
          id?: string
          quantity?: number
          rate: number
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_of_materials: {
        Row: {
          bom_code: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          product_item_id: string | null
          product_name: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          bom_code: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          product_item_id?: string | null
          product_name: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          bom_code?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          product_item_id?: string | null
          product_name?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_of_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          ai_extracted: boolean
          amount: number
          attachment_url: string | null
          bill_date: string
          bill_number: string
          created_at: string
          currency_code: string | null
          deleted_at: string | null
          due_date: string | null
          exchange_rate: number | null
          goods_receipt_id: string | null
          id: string
          is_deleted: boolean
          notes: string | null
          organization_id: string
          purchase_order_id: string | null
          status: string
          tax_amount: number
          tds_rate: number | null
          tds_section: string | null
          total_amount: number
          updated_at: string
          user_id: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          ai_extracted?: boolean
          amount?: number
          attachment_url?: string | null
          bill_date?: string
          bill_number: string
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          due_date?: string | null
          exchange_rate?: number | null
          goods_receipt_id?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          organization_id?: string
          purchase_order_id?: string | null
          status?: string
          tax_amount?: number
          tds_rate?: number | null
          tds_section?: string | null
          total_amount?: number
          updated_at?: string
          user_id: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          ai_extracted?: boolean
          amount?: number
          attachment_url?: string | null
          bill_date?: string
          bill_number?: string
          created_at?: string
          currency_code?: string | null
          deleted_at?: string | null
          due_date?: string | null
          exchange_rate?: number | null
          goods_receipt_id?: string | null
          id?: string
          is_deleted?: boolean
          notes?: string | null
          organization_id?: string
          purchase_order_id?: string | null
          status?: string
          tax_amount?: number
          tds_rate?: number | null
          tds_section?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bills_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bin_locations: {
        Row: {
          aisle: string | null
          bin_code: string
          capacity_units: number | null
          created_at: string
          current_units: number
          id: string
          is_active: boolean
          level: string | null
          notes: string | null
          organization_id: string
          rack: string | null
          updated_at: string
          warehouse_id: string
          zone: string | null
        }
        Insert: {
          aisle?: string | null
          bin_code: string
          capacity_units?: number | null
          created_at?: string
          current_units?: number
          id?: string
          is_active?: boolean
          level?: string | null
          notes?: string | null
          organization_id: string
          rack?: string | null
          updated_at?: string
          warehouse_id: string
          zone?: string | null
        }
        Update: {
          aisle?: string | null
          bin_code?: string
          capacity_units?: number | null
          created_at?: string
          current_units?: number
          id?: string
          is_active?: boolean
          level?: string | null
          notes?: string | null
          organization_id?: string
          rack?: string | null
          updated_at?: string
          warehouse_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bin_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bin_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_lines: {
        Row: {
          bom_id: string
          created_at: string
          est_cost: number | null
          id: string
          item_id: string | null
          material_name: string
          notes: string | null
          quantity: number
          sort_order: number
          uom: string
          wastage_pct: number
        }
        Insert: {
          bom_id: string
          created_at?: string
          est_cost?: number | null
          id?: string
          item_id?: string | null
          material_name: string
          notes?: string | null
          quantity?: number
          sort_order?: number
          uom?: string
          wastage_pct?: number
        }
        Update: {
          bom_id?: string
          created_at?: string
          est_cost?: number | null
          id?: string
          item_id?: string | null
          material_name?: string
          notes?: string | null
          quantity?: number
          sort_order?: number
          uom?: string
          wastage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string
          budget_amount: number
          created_at: string
          fiscal_period_id: string
          id: string
          notes: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          budget_amount?: number
          created_at?: string
          fiscal_period_id: string
          id?: string
          notes?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          budget_amount?: number
          created_at?: string
          fiscal_period_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_upload_history: {
        Row: {
          created_at: string
          errors: string[] | null
          failed_rows: number
          file_name: string
          id: string
          module: string
          organization_id: string
          successful_rows: number
          total_rows: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          errors?: string[] | null
          failed_rows?: number
          file_name: string
          id?: string
          module: string
          organization_id?: string
          successful_rows?: number
          total_rows?: number
          uploaded_by: string
        }
        Update: {
          created_at?: string
          errors?: string[] | null
          failed_rows?: number
          file_name?: string
          id?: string
          module?: string
          organization_id?: string
          successful_rows?: number
          total_rows?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_upload_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bulk_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          created_at: string
          current_balance: number
          description: string | null
          id: string
          is_active: boolean
          opening_balance: number
          organization_id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          created_at?: string
          current_balance?: number
          description?: string | null
          id?: string
          is_active?: boolean
          opening_balance?: number
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          created_at?: string
          current_balance?: number
          description?: string | null
          id?: string
          is_active?: boolean
          opening_balance?: number
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_coa_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_components: {
        Row: {
          annual_amount: number
          compensation_structure_id: string
          component_name: string
          component_type: string
          created_at: string
          display_order: number
          id: string
          is_taxable: boolean
          monthly_amount: number | null
          percentage_of_basic: number | null
        }
        Insert: {
          annual_amount?: number
          compensation_structure_id: string
          component_name: string
          component_type: string
          created_at?: string
          display_order?: number
          id?: string
          is_taxable?: boolean
          monthly_amount?: number | null
          percentage_of_basic?: number | null
        }
        Update: {
          annual_amount?: number
          compensation_structure_id?: string
          component_name?: string
          component_type?: string
          created_at?: string
          display_order?: number
          id?: string
          is_taxable?: boolean
          monthly_amount?: number | null
          percentage_of_basic?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compensation_components_compensation_structure_id_fkey"
            columns: ["compensation_structure_id"]
            isOneToOne: false
            referencedRelation: "compensation_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_revision_requests: {
        Row: {
          created_at: string
          current_ctc: number
          effective_from: string
          id: string
          organization_id: string
          profile_id: string
          proposed_components: Json | null
          proposed_ctc: number
          requested_by: string
          requested_by_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          revision_reason: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_ctc?: number
          effective_from: string
          id?: string
          organization_id: string
          profile_id: string
          proposed_components?: Json | null
          proposed_ctc: number
          requested_by: string
          requested_by_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          revision_reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_ctc?: number
          effective_from?: string
          id?: string
          organization_id?: string
          profile_id?: string
          proposed_components?: Json | null
          proposed_ctc?: number
          requested_by?: string
          requested_by_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          revision_reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_revision_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_revision_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_revision_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_revision_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_structures: {
        Row: {
          annual_ctc: number
          created_at: string
          created_by: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          notes: string | null
          organization_id: string
          profile_id: string
          revision_number: number
          revision_reason: string | null
          updated_at: string
        }
        Insert: {
          annual_ctc: number
          created_at?: string
          created_by: string
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          profile_id: string
          revision_number?: number
          revision_reason?: string | null
          updated_at?: string
        }
        Update: {
          annual_ctc?: number
          created_at?: string
          created_by?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          profile_id?: string
          revision_number?: number
          revision_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_structures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_structures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_structures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_structures_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_logs: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string | null
          organization_id: string
          payload: Json | null
          provider: string
          status: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          organization_id: string
          payload?: Json | null
          provider: string
          status?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          organization_id?: string
          payload?: Json | null
          provider?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connector_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_date: string
          consent_given: boolean
          consent_type: string
          consent_version: string | null
          created_at: string
          id: string
          ip_address: string | null
          legal_basis: string | null
          organization_id: string
          purpose_description: string | null
          updated_at: string
          user_id: string
          withdrawal_date: string | null
        }
        Insert: {
          consent_date?: string
          consent_given?: boolean
          consent_type: string
          consent_version?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          legal_basis?: string | null
          organization_id: string
          purpose_description?: string | null
          updated_at?: string
          user_id: string
          withdrawal_date?: string | null
        }
        Update: {
          consent_date?: string
          consent_given?: boolean
          consent_type?: string
          consent_version?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          legal_basis?: string | null
          organization_id?: string
          purpose_description?: string | null
          updated_at?: string
          user_id?: string
          withdrawal_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      control_account_overrides: {
        Row: {
          approved_by: string | null
          created_at: string
          gl_account_id: string
          id: string
          journal_entry_id: string | null
          organization_id: string
          overridden_by: string
          override_reason: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          gl_account_id: string
          id?: string
          journal_entry_id?: string | null
          organization_id: string
          overridden_by: string
          override_reason: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          gl_account_id?: string
          id?: string
          journal_entry_id?: string | null
          organization_id?: string
          overridden_by?: string
          override_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_account_overrides_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_account_overrides_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_account_overrides_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_base"
            referencedColumns: ["journal_entry_id"]
          },
          {
            foreignKeyName: "control_account_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_card_transactions: {
        Row: {
          ai_match_id: string | null
          ai_match_type: string | null
          ai_suggested_category: string | null
          amount: number
          card_id: string
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_duplicate_flag: boolean | null
          merchant_name: string
          organization_id: string
          reconciled: boolean | null
          status: string
          transaction_date: string
          user_id: string
        }
        Insert: {
          ai_match_id?: string | null
          ai_match_type?: string | null
          ai_suggested_category?: string | null
          amount: number
          card_id: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_duplicate_flag?: boolean | null
          merchant_name: string
          organization_id?: string
          reconciled?: boolean | null
          status?: string
          transaction_date?: string
          user_id: string
        }
        Update: {
          ai_match_id?: string | null
          ai_match_type?: string | null
          ai_suggested_category?: string | null
          amount?: number
          card_id?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_duplicate_flag?: boolean | null
          merchant_name?: string
          organization_id?: string
          reconciled?: boolean | null
          status?: string
          transaction_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cc_txn_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          bank_name: string | null
          card_last_four: string | null
          card_name: string
          card_network: string | null
          created_at: string
          credit_limit: number | null
          current_balance: number | null
          id: string
          organization_id: string
          payment_due_date: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_name?: string | null
          card_last_four?: string | null
          card_name: string
          card_network?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          id?: string
          organization_id?: string
          payment_due_date?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_name?: string | null
          card_last_four?: string | null
          card_name?: string
          card_network?: string | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          id?: string
          organization_id?: string
          payment_due_date?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cc_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          client_name: string
          created_at: string
          credit_note_number: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          issue_date: string
          organization_id: string
          reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          client_name: string
          created_at?: string
          credit_note_number: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          issue_date?: string
          organization_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_name?: string
          created_at?: string
          credit_note_number?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          issue_date?: string
          organization_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cn_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimal_places: number
          id: string
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          name: string
          symbol?: string
        }
        Update: {
          code?: string
          created_at?: string
          decimal_places?: number
          id?: string
          is_active?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          status: string
          tax_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customers_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_breach_log: {
        Row: {
          affected_data_types: string[] | null
          authority_notified: boolean | null
          breach_date: string
          breach_type: string
          containment_actions: string | null
          created_at: string
          description: string
          detected_date: string
          dpo_notified: boolean | null
          estimated_affected_count: number | null
          id: string
          organization_id: string
          remediation_steps: string | null
          reported_by: string
          reported_to_authority_date: string | null
          reported_to_users_date: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          affected_data_types?: string[] | null
          authority_notified?: boolean | null
          breach_date: string
          breach_type: string
          containment_actions?: string | null
          created_at?: string
          description: string
          detected_date?: string
          dpo_notified?: boolean | null
          estimated_affected_count?: number | null
          id?: string
          organization_id: string
          remediation_steps?: string | null
          reported_by: string
          reported_to_authority_date?: string | null
          reported_to_users_date?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          affected_data_types?: string[] | null
          authority_notified?: boolean | null
          breach_date?: string
          breach_type?: string
          containment_actions?: string | null
          created_at?: string
          description?: string
          detected_date?: string
          dpo_notified?: boolean | null
          estimated_affected_count?: number | null
          id?: string
          organization_id?: string
          remediation_steps?: string | null
          reported_by?: string
          reported_to_authority_date?: string | null
          reported_to_users_date?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_breach_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_erasure_requests: {
        Row: {
          acknowledgment_number: string | null
          completion_notes: string | null
          created_at: string
          data_categories: string[] | null
          deadline_date: string | null
          id: string
          organization_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          rejection_reason: string | null
          request_type: string
          requested_by: string
          status: string
          target_user_id: string
          updated_at: string
        }
        Insert: {
          acknowledgment_number?: string | null
          completion_notes?: string | null
          created_at?: string
          data_categories?: string[] | null
          deadline_date?: string | null
          id?: string
          organization_id: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_by: string
          status?: string
          target_user_id: string
          updated_at?: string
        }
        Update: {
          acknowledgment_number?: string | null
          completion_notes?: string | null
          created_at?: string
          data_categories?: string[] | null
          deadline_date?: string | null
          id?: string
          organization_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          rejection_reason?: string | null
          request_type?: string
          requested_by?: string
          status?: string
          target_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_erasure_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_export_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          data_categories: string[] | null
          expires_at: string | null
          file_url: string | null
          id: string
          organization_id: string
          request_type: string
          requested_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          data_categories?: string[] | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          organization_id: string
          request_type?: string
          requested_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          data_categories?: string[] | null
          expires_at?: string | null
          file_url?: string | null
          id?: string
          organization_id?: string
          request_type?: string
          requested_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_note_items: {
        Row: {
          created_at: string
          delivery_note_id: string
          description: string
          id: string
          item_id: string | null
          ordered_quantity: number
          sales_order_item_id: string | null
          shipped_quantity: number
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_note_id: string
          description: string
          id?: string
          item_id?: string | null
          ordered_quantity?: number
          sales_order_item_id?: string | null
          shipped_quantity?: number
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_note_id?: string
          description?: string
          id?: string
          item_id?: string | null
          ordered_quantity?: number
          sales_order_item_id?: string | null
          shipped_quantity?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          actual_delivery: string | null
          carrier_name: string | null
          created_at: string
          customer_id: string | null
          delivery_date: string
          dispatched_by: string | null
          dn_number: string
          estimated_delivery: string | null
          id: string
          notes: string | null
          organization_id: string
          packages_count: number | null
          sales_order_id: string | null
          shipping_cost: number | null
          shipping_method: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          actual_delivery?: string | null
          carrier_name?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_date?: string
          dispatched_by?: string | null
          dn_number: string
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          packages_count?: number | null
          sales_order_id?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          actual_delivery?: string | null
          carrier_name?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_date?: string
          dispatched_by?: string | null
          dn_number?: string
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          packages_count?: number | null
          sales_order_id?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          created_at: string
          document_type: string
          id: string
          next_number: number
          organization_id: string
          prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          next_number?: number
          organization_id: string
          prefix?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          next_number?: number
          organization_id?: string
          prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      e_invoices: {
        Row: {
          ack_date: string | null
          ack_number: string | null
          api_response: Json | null
          buyer_address: string | null
          buyer_gstin: string | null
          buyer_legal_name: string
          buyer_location: string | null
          buyer_pincode: string | null
          buyer_pos: string | null
          buyer_state_code: string | null
          buyer_trade_name: string | null
          cancel_reason: string | null
          cancel_remark: string | null
          cancelled_at: string | null
          created_at: string
          doc_date: string
          doc_number: string
          doc_type: string
          error_details: Json | null
          eway_bill_date: string | null
          eway_bill_number: string | null
          eway_bill_valid_until: string | null
          id: string
          invoice_id: string | null
          irn: string | null
          irn_generated_at: string | null
          items: Json
          organization_id: string
          round_off_amount: number | null
          seller_address: string | null
          seller_gstin: string
          seller_legal_name: string
          seller_location: string | null
          seller_pincode: string | null
          seller_state_code: string | null
          seller_trade_name: string | null
          signed_invoice: string | null
          signed_qr_code: string | null
          status: string
          supply_type: string
          total_assessable_value: number
          total_cess: number
          total_cgst: number
          total_discount: number
          total_igst: number
          total_invoice_value: number
          total_other_charges: number
          total_sgst: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ack_date?: string | null
          ack_number?: string | null
          api_response?: Json | null
          buyer_address?: string | null
          buyer_gstin?: string | null
          buyer_legal_name: string
          buyer_location?: string | null
          buyer_pincode?: string | null
          buyer_pos?: string | null
          buyer_state_code?: string | null
          buyer_trade_name?: string | null
          cancel_reason?: string | null
          cancel_remark?: string | null
          cancelled_at?: string | null
          created_at?: string
          doc_date: string
          doc_number: string
          doc_type?: string
          error_details?: Json | null
          eway_bill_date?: string | null
          eway_bill_number?: string | null
          eway_bill_valid_until?: string | null
          id?: string
          invoice_id?: string | null
          irn?: string | null
          irn_generated_at?: string | null
          items?: Json
          organization_id: string
          round_off_amount?: number | null
          seller_address?: string | null
          seller_gstin: string
          seller_legal_name: string
          seller_location?: string | null
          seller_pincode?: string | null
          seller_state_code?: string | null
          seller_trade_name?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          status?: string
          supply_type?: string
          total_assessable_value?: number
          total_cess?: number
          total_cgst?: number
          total_discount?: number
          total_igst?: number
          total_invoice_value?: number
          total_other_charges?: number
          total_sgst?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ack_date?: string | null
          ack_number?: string | null
          api_response?: Json | null
          buyer_address?: string | null
          buyer_gstin?: string | null
          buyer_legal_name?: string
          buyer_location?: string | null
          buyer_pincode?: string | null
          buyer_pos?: string | null
          buyer_state_code?: string | null
          buyer_trade_name?: string | null
          cancel_reason?: string | null
          cancel_remark?: string | null
          cancelled_at?: string | null
          created_at?: string
          doc_date?: string
          doc_number?: string
          doc_type?: string
          error_details?: Json | null
          eway_bill_date?: string | null
          eway_bill_number?: string | null
          eway_bill_valid_until?: string | null
          id?: string
          invoice_id?: string | null
          irn?: string | null
          irn_generated_at?: string | null
          items?: Json
          organization_id?: string
          round_off_amount?: number | null
          seller_address?: string | null
          seller_gstin?: string
          seller_legal_name?: string
          seller_location?: string | null
          seller_pincode?: string | null
          seller_state_code?: string | null
          seller_trade_name?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          status?: string
          supply_type?: string
          total_assessable_value?: number
          total_cess?: number
          total_cgst?: number
          total_discount?: number
          total_igst?: number
          total_invoice_value?: number
          total_other_charges?: number
          total_sgst?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "e_invoices_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_code_mappings: {
        Row: {
          created_at: string
          employee_code: string
          employee_name_hint: string | null
          id: string
          organization_id: string
          profile_id: string
          source_device: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_code: string
          employee_name_hint?: string | null
          id?: string
          organization_id: string
          profile_id: string
          source_device?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_code?: string
          employee_name_hint?: string | null
          id?: string
          organization_id?: string
          profile_id?: string
          source_device?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_code_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_code_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_code_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_code_mappings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_details: {
        Row: {
          aadhaar_last_four: string | null
          address_line1: string | null
          address_line2: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          blood_group: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id_number: string | null
          esi_number: string | null
          gender: string | null
          id: string
          marital_status: string | null
          nationality: string | null
          organization_id: string
          pan_number: string | null
          pincode: string | null
          profile_id: string
          state: string | null
          uan_number: string | null
          updated_at: string
        }
        Insert: {
          aadhaar_last_four?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          blood_group?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id_number?: string | null
          esi_number?: string | null
          gender?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          organization_id?: string
          pan_number?: string | null
          pincode?: string | null
          profile_id: string
          state?: string | null
          uan_number?: string | null
          updated_at?: string
        }
        Update: {
          aadhaar_last_four?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          blood_group?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id_number?: string | null
          esi_number?: string | null
          gender?: string | null
          id?: string
          marital_status?: string | null
          nationality?: string | null
          organization_id?: string
          pan_number?: string | null
          pincode?: string | null
          profile_id?: string
          state?: string | null
          uan_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          organization_id: string
          profile_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type?: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          profile_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          profile_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_tax_settings: {
        Row: {
          created_at: string | null
          declared_80c: number | null
          declared_80d: number | null
          financial_year: string
          hra_exemption: number | null
          id: string
          organization_id: string
          other_deductions: number | null
          previous_employer_income: number | null
          previous_employer_tds: number | null
          profile_id: string
          regime_id: string | null
          standard_deduction: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          declared_80c?: number | null
          declared_80d?: number | null
          financial_year?: string
          hra_exemption?: number | null
          id?: string
          organization_id: string
          other_deductions?: number | null
          previous_employer_income?: number | null
          previous_employer_tds?: number | null
          profile_id: string
          regime_id?: string | null
          standard_deduction?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          declared_80c?: number | null
          declared_80d?: number | null
          financial_year?: string
          hra_exemption?: number | null
          id?: string
          organization_id?: string
          other_deductions?: number | null
          previous_employer_income?: number | null
          previous_employer_tds?: number | null
          profile_id?: string
          regime_id?: string | null
          standard_deduction?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_tax_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tax_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tax_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tax_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_tax_settings_regime_id_fkey"
            columns: ["regime_id"]
            isOneToOne: false
            referencedRelation: "tax_regimes"
            referencedColumns: ["id"]
          },
        ]
      }
      eway_bills: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cess_rate: number | null
          cgst_rate: number | null
          created_at: string
          delivery_note_id: string | null
          distance_km: number | null
          document_date: string | null
          document_number: string | null
          document_type: string | null
          eway_bill_date: string | null
          eway_bill_number: string | null
          extended_count: number | null
          from_address: string | null
          from_gstin: string | null
          from_name: string | null
          from_pincode: string | null
          from_place: string | null
          from_state_code: string | null
          hsn_code: string | null
          id: string
          igst_rate: number | null
          invoice_id: string | null
          metadata: Json | null
          notes: string | null
          organization_id: string
          product_description: string | null
          product_name: string | null
          quantity: number | null
          sales_order_id: string | null
          sgst_rate: number | null
          status: string
          sub_supply_type: string | null
          supply_type: string
          taxable_value: number
          to_address: string | null
          to_gstin: string | null
          to_name: string | null
          to_pincode: string | null
          to_place: string | null
          to_state_code: string | null
          total_value: number
          transport_doc_date: string | null
          transport_doc_number: string | null
          transport_mode: string | null
          transporter_id: string | null
          transporter_name: string | null
          unit: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cess_rate?: number | null
          cgst_rate?: number | null
          created_at?: string
          delivery_note_id?: string | null
          distance_km?: number | null
          document_date?: string | null
          document_number?: string | null
          document_type?: string | null
          eway_bill_date?: string | null
          eway_bill_number?: string | null
          extended_count?: number | null
          from_address?: string | null
          from_gstin?: string | null
          from_name?: string | null
          from_pincode?: string | null
          from_place?: string | null
          from_state_code?: string | null
          hsn_code?: string | null
          id?: string
          igst_rate?: number | null
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          product_description?: string | null
          product_name?: string | null
          quantity?: number | null
          sales_order_id?: string | null
          sgst_rate?: number | null
          status?: string
          sub_supply_type?: string | null
          supply_type?: string
          taxable_value?: number
          to_address?: string | null
          to_gstin?: string | null
          to_name?: string | null
          to_pincode?: string | null
          to_place?: string | null
          to_state_code?: string | null
          total_value?: number
          transport_doc_date?: string | null
          transport_doc_number?: string | null
          transport_mode?: string | null
          transporter_id?: string | null
          transporter_name?: string | null
          unit?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cess_rate?: number | null
          cgst_rate?: number | null
          created_at?: string
          delivery_note_id?: string | null
          distance_km?: number | null
          document_date?: string | null
          document_number?: string | null
          document_type?: string | null
          eway_bill_date?: string | null
          eway_bill_number?: string | null
          extended_count?: number | null
          from_address?: string | null
          from_gstin?: string | null
          from_name?: string | null
          from_pincode?: string | null
          from_place?: string | null
          from_state_code?: string | null
          hsn_code?: string | null
          id?: string
          igst_rate?: number | null
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          product_description?: string | null
          product_name?: string | null
          quantity?: number | null
          sales_order_id?: string | null
          sgst_rate?: number | null
          status?: string
          sub_supply_type?: string | null
          supply_type?: string
          taxable_value?: number
          to_address?: string | null
          to_gstin?: string | null
          to_name?: string | null
          to_pincode?: string | null
          to_place?: string | null
          to_state_code?: string | null
          total_value?: number
          transport_doc_date?: string | null
          transport_doc_number?: string | null
          transport_mode?: string | null
          transporter_id?: string | null
          transporter_name?: string | null
          unit?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          vehicle_number?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eway_bills_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eway_bills_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eway_bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eway_bills_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          effective_date: string
          from_currency: string
          id: string
          organization_id: string
          rate: number
          source: string | null
          to_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_date?: string
          from_currency?: string
          id?: string
          organization_id: string
          rate?: number
          source?: string | null
          to_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          from_currency?: string
          id?: string
          organization_id?: string
          rate?: number
          source?: string | null
          to_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          deleted_at: string | null
          description: string | null
          expense_date: string
          id: string
          is_deleted: boolean
          notes: string | null
          organization_id: string
          profile_id: string | null
          receipt_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          expense_date?: string
          id?: string
          is_deleted?: boolean
          notes?: string | null
          organization_id?: string
          profile_id?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          account_code: string | null
          amount: number
          category: string
          created_at: string
          credit: number
          currency_code: string | null
          debit: number
          deleted_at: string | null
          description: string | null
          exchange_rate: number | null
          id: string
          ind_as_category: string | null
          is_deleted: boolean
          is_posted: boolean
          journal_entry_id: string | null
          memo: string | null
          organization_id: string
          performance_obligation: string | null
          posted_at: string | null
          posting_date: string | null
          recognition_method: string | null
          record_date: string
          reference_id: string | null
          reference_type: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_code?: string | null
          amount: number
          category: string
          created_at?: string
          credit?: number
          currency_code?: string | null
          debit?: number
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number | null
          id?: string
          ind_as_category?: string | null
          is_deleted?: boolean
          is_posted?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          organization_id?: string
          performance_obligation?: string | null
          posted_at?: string | null
          posting_date?: string | null
          recognition_method?: string | null
          record_date?: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_code?: string | null
          amount?: number
          category?: string
          created_at?: string
          credit?: number
          currency_code?: string | null
          debit?: number
          deleted_at?: string | null
          description?: string | null
          exchange_rate?: number | null
          id?: string
          ind_as_category?: string | null
          is_deleted?: boolean
          is_posted?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          organization_id?: string
          performance_obligation?: string | null
          posted_at?: string | null
          posting_date?: string | null
          recognition_method?: string | null
          record_date?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_fr_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          organization_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          organization_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_years_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finished_goods_entries: {
        Row: {
          cost_per_unit: number | null
          created_at: string
          id: string
          item_id: string | null
          notes: string | null
          organization_id: string
          posted_at: string
          product_name: string
          quantity: number
          rejected_quantity: number
          total_cost: number | null
          warehouse_id: string | null
          work_order_id: string
        }
        Insert: {
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          organization_id: string
          posted_at?: string
          product_name: string
          quantity?: number
          rejected_quantity?: number
          total_cost?: number | null
          warehouse_id?: string | null
          work_order_id: string
        }
        Update: {
          cost_per_unit?: number | null
          created_at?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          organization_id?: string
          posted_at?: string
          product_name?: string
          quantity?: number
          rejected_quantity?: number
          total_cost?: number | null
          warehouse_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finished_goods_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_goods_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_goods_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finished_goods_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          financial_year_id: string
          id: string
          organization_id: string
          period_name: string
          period_number: number
          start_date: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          financial_year_id: string
          id?: string
          organization_id: string
          period_name: string
          period_number: number
          start_date: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          financial_year_id?: string
          id?: string
          organization_id?: string
          period_name?: string
          period_number?: number
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form16_records: {
        Row: {
          created_at: string | null
          exemptions_json: Json | null
          financial_year: string
          form16_pdf_url: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          organization_id: string
          profile_id: string
          total_pf: number | null
          total_salary: number | null
          total_tds: number | null
        }
        Insert: {
          created_at?: string | null
          exemptions_json?: Json | null
          financial_year: string
          form16_pdf_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          organization_id: string
          profile_id: string
          total_pf?: number | null
          total_salary?: number | null
          total_tds?: number | null
        }
        Update: {
          created_at?: string | null
          exemptions_json?: Json | null
          financial_year?: string
          form16_pdf_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          organization_id?: string
          profile_id?: string
          total_pf?: number | null
          total_salary?: number | null
          total_tds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "form16_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form16_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form16_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form16_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          account_type: string
          code: string
          control_module: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_control_account: boolean
          is_locked: boolean
          is_system: boolean
          name: string
          normal_balance: string
          organization_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          code: string
          control_module?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          is_locked?: boolean
          is_system?: boolean
          name: string
          normal_balance?: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          code?: string
          control_module?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_control_account?: boolean
          is_locked?: boolean
          is_system?: boolean
          name?: string
          normal_balance?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_cycle_config: {
        Row: {
          created_at: string
          cycle_month: string
          id: string
          input_deadline_day: number
          input_start_day: number
          is_active: boolean
          organization_id: string
          scoring_deadline_day: number
          scoring_start_day: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_month: string
          id?: string
          input_deadline_day?: number
          input_start_day?: number
          is_active?: boolean
          organization_id: string
          scoring_deadline_day?: number
          scoring_start_day?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_month?: string
          id?: string
          input_deadline_day?: number
          input_start_day?: number
          is_active?: boolean
          organization_id?: string
          scoring_deadline_day?: number
          scoring_start_day?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_cycle_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_plans: {
        Row: {
          created_at: string
          id: string
          items: Json
          month: string
          organization_id: string
          profile_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          month: string
          organization_id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          month?: string
          organization_id?: string
          profile_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_gp_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_plans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          category: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          owner: string | null
          progress: number
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          owner?: string | null
          progress?: number
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          owner?: string | null
          progress?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_goals_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          accepted_quantity: number
          created_at: string
          description: string
          goods_receipt_id: string
          id: string
          item_id: string | null
          notes: string | null
          ordered_quantity: number
          purchase_order_item_id: string | null
          received_quantity: number
          rejected_quantity: number
          warehouse_id: string | null
        }
        Insert: {
          accepted_quantity?: number
          created_at?: string
          description: string
          goods_receipt_id: string
          id?: string
          item_id?: string | null
          notes?: string | null
          ordered_quantity?: number
          purchase_order_item_id?: string | null
          received_quantity?: number
          rejected_quantity?: number
          warehouse_id?: string | null
        }
        Update: {
          accepted_quantity?: number
          created_at?: string
          description?: string
          goods_receipt_id?: string
          id?: string
          item_id?: string | null
          notes?: string | null
          ordered_quantity?: number
          purchase_order_item_id?: string | null
          received_quantity?: number
          rejected_quantity?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          grn_number: string
          id: string
          notes: string | null
          organization_id: string
          purchase_order_id: string | null
          receipt_date: string
          received_by: string
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          grn_number: string
          id?: string
          notes?: string | null
          organization_id: string
          purchase_order_id?: string | null
          receipt_date?: string
          received_by: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          grn_number?: string
          id?: string
          notes?: string | null
          organization_id?: string
          purchase_order_id?: string | null
          receipt_date?: string
          received_by?: string
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_filing_status: {
        Row: {
          arn_number: string | null
          challan_date: string | null
          challan_number: string | null
          created_at: string
          filed_by: string | null
          filed_date: string | null
          filing_type: string
          financial_year: string
          id: string
          net_tax_payable: number | null
          notes: string | null
          organization_id: string
          period_month: number
          period_year: number
          status: string
          total_itc_claimed: number | null
          total_tax_liability: number | null
          updated_at: string
        }
        Insert: {
          arn_number?: string | null
          challan_date?: string | null
          challan_number?: string | null
          created_at?: string
          filed_by?: string | null
          filed_date?: string | null
          filing_type: string
          financial_year: string
          id?: string
          net_tax_payable?: number | null
          notes?: string | null
          organization_id: string
          period_month: number
          period_year: number
          status?: string
          total_itc_claimed?: number | null
          total_tax_liability?: number | null
          updated_at?: string
        }
        Update: {
          arn_number?: string | null
          challan_date?: string | null
          challan_number?: string | null
          created_at?: string
          filed_by?: string | null
          filed_date?: string | null
          filing_type?: string
          financial_year?: string
          id?: string
          net_tax_payable?: number | null
          notes?: string | null
          organization_id?: string
          period_month?: number
          period_year?: number
          status?: string
          total_itc_claimed?: number | null
          total_tax_liability?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gst_filing_status_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          date: string
          id: string
          name: string
          organization_id: string
          year: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          organization_id?: string
          year?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          organization_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_holidays_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          connected_at: string | null
          created_at: string
          id: string
          last_sync_at: string | null
          metadata: Json | null
          organization_id: string
          provider: string
          shop_domain: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          organization_id: string
          provider?: string
          shop_domain?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          metadata?: Json | null
          organization_id?: string
          provider?: string
          shop_domain?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrity_audit_runs: {
        Row: {
          checks: Json
          completed_at: string | null
          created_at: string
          engine_status: string
          failed: number
          id: string
          organization_id: string | null
          passed: number
          run_by: string
          run_scope: string
          started_at: string
          summary: Json | null
          total_checks: number
          warnings: number
        }
        Insert: {
          checks?: Json
          completed_at?: string | null
          created_at?: string
          engine_status?: string
          failed?: number
          id?: string
          organization_id?: string | null
          passed?: number
          run_by: string
          run_scope?: string
          started_at?: string
          summary?: Json | null
          total_checks?: number
          warnings?: number
        }
        Update: {
          checks?: Json
          completed_at?: string | null
          created_at?: string
          engine_status?: string
          failed?: number
          id?: string
          organization_id?: string | null
          passed?: number
          run_by?: string
          run_scope?: string
          started_at?: string
          summary?: Json | null
          total_checks?: number
          warnings?: number
        }
        Relationships: [
          {
            foreignKeyName: "integrity_audit_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          bin_id: string | null
          count_id: string
          counted_quantity: number
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          notes: string | null
          system_quantity: number
          variance: number
        }
        Insert: {
          bin_id?: string | null
          count_id: string
          counted_quantity?: number
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          notes?: string | null
          system_quantity?: number
          variance?: number
        }
        Update: {
          bin_id?: string | null
          count_id?: string
          counted_quantity?: number
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          notes?: string | null
          system_quantity?: number
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_lines: {
        Row: {
          actual_qty: number | null
          bin_id: string | null
          count_id: string
          created_at: string
          expected_qty: number
          id: string
          item_id: string | null
          item_name: string
          notes: string | null
          variance: number | null
        }
        Insert: {
          actual_qty?: number | null
          bin_id?: string | null
          count_id: string
          created_at?: string
          expected_qty?: number
          id?: string
          item_id?: string | null
          item_name: string
          notes?: string | null
          variance?: number | null
        }
        Update: {
          actual_qty?: number | null
          bin_id?: string | null
          count_id?: string
          created_at?: string
          expected_qty?: number
          id?: string
          item_id?: string | null
          item_name?: string
          notes?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_lines_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          count_date: string
          count_number: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          count_date?: string
          count_number: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          count_date?: string
          count_number?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_declarations: {
        Row: {
          approved_amount: number | null
          created_at: string | null
          declared_amount: number | null
          financial_year: string
          id: string
          notes: string | null
          organization_id: string
          profile_id: string
          proof_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          section_type: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          approved_amount?: number | null
          created_at?: string | null
          declared_amount?: number | null
          financial_year: string
          id?: string
          notes?: string | null
          organization_id: string
          profile_id: string
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_type: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_amount?: number | null
          created_at?: string | null
          declared_amount?: number | null
          financial_year?: string
          id?: string
          notes?: string | null
          organization_id?: string
          profile_id?: string
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_type?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_declarations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_declarations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_declarations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_declarations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          cgst_amount: number
          cgst_rate: number
          created_at: string
          description: string
          hsn_sac: string | null
          id: string
          igst_amount: number
          igst_rate: number
          invoice_id: string
          quantity: number
          rate: number
          sgst_amount: number
          sgst_rate: number
        }
        Insert: {
          amount: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          description: string
          hsn_sac?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_id: string
          quantity?: number
          rate: number
          sgst_amount?: number
          sgst_rate?: number
        }
        Update: {
          amount?: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          description?: string
          hsn_sac?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_id?: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          sgst_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          account_name: string | null
          account_number: string | null
          account_type: string | null
          address_line1: string | null
          address_line2: string | null
          bank_name: string | null
          branch: string | null
          cin: string | null
          city: string | null
          company_name: string | null
          country: string | null
          created_at: string
          custom_footer_text: string | null
          email: string | null
          gstin: string | null
          id: string
          ifsc_code: string | null
          logo_url: string | null
          msme_number: string | null
          organization_id: string
          phone: string | null
          pincode: string | null
          signature_url: string | null
          state: string | null
          updated_at: string
          upi_code: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          account_type?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bank_name?: string | null
          branch?: string | null
          cin?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          custom_footer_text?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          ifsc_code?: string | null
          logo_url?: string | null
          msme_number?: string | null
          organization_id?: string
          phone?: string | null
          pincode?: string | null
          signature_url?: string | null
          state?: string | null
          updated_at?: string
          upi_code?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          account_type?: string | null
          address_line1?: string | null
          address_line2?: string | null
          bank_name?: string | null
          branch?: string | null
          cin?: string | null
          city?: string | null
          company_name?: string | null
          country?: string | null
          created_at?: string
          custom_footer_text?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          ifsc_code?: string | null
          logo_url?: string | null
          msme_number?: string | null
          organization_id?: string
          phone?: string | null
          pincode?: string | null
          signature_url?: string | null
          state?: string | null
          updated_at?: string
          upi_code?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_inv_settings_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          cgst_total: number
          client_email: string
          client_name: string
          created_at: string
          currency_code: string | null
          customer_gstin: string | null
          customer_id: string | null
          deleted_at: string | null
          delivery_note_id: string | null
          due_date: string
          exchange_rate: number | null
          id: string
          igst_total: number
          invoice_date: string
          invoice_number: string
          is_deleted: boolean
          notes: string | null
          organization_id: string
          original_pdf_path: string | null
          payment_terms: string | null
          place_of_supply: string | null
          sales_order_id: string | null
          sgst_total: number
          signed_pdf_path: string | null
          signing_completed_at: string | null
          signing_failure_reason: string | null
          signing_initiated_at: string | null
          signing_status: string | null
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          amount: number
          cgst_total?: number
          client_email: string
          client_name: string
          created_at?: string
          currency_code?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          delivery_note_id?: string | null
          due_date: string
          exchange_rate?: number | null
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_number: string
          is_deleted?: boolean
          notes?: string | null
          organization_id?: string
          original_pdf_path?: string | null
          payment_terms?: string | null
          place_of_supply?: string | null
          sales_order_id?: string | null
          sgst_total?: number
          signed_pdf_path?: string | null
          signing_completed_at?: string | null
          signing_failure_reason?: string | null
          signing_initiated_at?: string | null
          signing_status?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          amount?: number
          cgst_total?: number
          client_email?: string
          client_name?: string
          created_at?: string
          currency_code?: string | null
          customer_gstin?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          delivery_note_id?: string | null
          due_date?: string
          exchange_rate?: number | null
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_number?: string
          is_deleted?: boolean
          notes?: string | null
          organization_id?: string
          original_pdf_path?: string | null
          payment_terms?: string | null
          place_of_supply?: string | null
          sales_order_id?: string | null
          sgst_total?: number
          signed_pdf_path?: string | null
          signing_completed_at?: string | null
          signing_failure_reason?: string | null
          signing_initiated_at?: string | null
          signing_status?: string | null
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          barcode: string | null
          category: string
          created_at: string
          created_by: string | null
          current_stock: number | null
          description: string | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          item_type: string
          metadata: Json | null
          name: string
          opening_stock: number | null
          organization_id: string
          purchase_price: number
          reorder_level: number | null
          reorder_quantity: number | null
          selling_price: number
          sku: string
          stock_value: number | null
          tax_rate: number | null
          uom_id: string | null
          updated_at: string
          valuation_method: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          current_stock?: number | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_type?: string
          metadata?: Json | null
          name: string
          opening_stock?: number | null
          organization_id: string
          purchase_price?: number
          reorder_level?: number | null
          reorder_quantity?: number | null
          selling_price?: number
          sku: string
          stock_value?: number | null
          tax_rate?: number | null
          uom_id?: string | null
          updated_at?: string
          valuation_method?: string
        }
        Update: {
          barcode?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          current_stock?: number | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_type?: string
          metadata?: Json | null
          name?: string
          opening_stock?: number | null
          organization_id?: string
          purchase_price?: number
          reorder_level?: number | null
          reorder_quantity?: number | null
          selling_price?: number
          sku?: string
          stock_value?: number | null
          tax_rate?: number | null
          uom_id?: string | null
          updated_at?: string
          valuation_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_sequence_number: string | null
          entry_date: string
          fiscal_period_id: string | null
          id: string
          is_deleted: boolean
          is_posted: boolean
          is_reversal: boolean
          memo: string | null
          organization_id: string
          posted_at: string
          reversed_entry_id: string | null
          source_id: string | null
          source_type: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_sequence_number?: string | null
          entry_date?: string
          fiscal_period_id?: string | null
          id?: string
          is_deleted?: boolean
          is_posted?: boolean
          is_reversal?: boolean
          memo?: string | null
          organization_id: string
          posted_at?: string
          reversed_entry_id?: string | null
          source_id?: string | null
          source_type: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_sequence_number?: string | null
          entry_date?: string
          fiscal_period_id?: string | null
          id?: string
          is_deleted?: boolean
          is_posted?: boolean
          is_reversal?: boolean
          memo?: string | null
          organization_id?: string
          posted_at?: string
          reversed_entry_id?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_base"
            referencedColumns: ["journal_entry_id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          asset_id: string | null
          cost_center: string | null
          created_at: string
          credit: number
          debit: number
          department: string | null
          description: string | null
          gl_account_id: string
          id: string
          journal_entry_id: string
        }
        Insert: {
          asset_id?: string | null
          cost_center?: string | null
          created_at?: string
          credit?: number
          debit?: number
          department?: string | null
          description?: string | null
          gl_account_id: string
          id?: string
          journal_entry_id: string
        }
        Update: {
          asset_id?: string | null
          cost_center?: string | null
          created_at?: string
          credit?: number
          debit?: number
          department?: string | null
          description?: string | null
          gl_account_id?: string
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_base"
            referencedColumns: ["journal_entry_id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string
          id: string
          leave_type: string
          organization_id: string
          profile_id: string | null
          total_days: number
          updated_at: string
          used_days: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          leave_type: string
          organization_id?: string
          profile_id?: string | null
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          leave_type?: string
          organization_id?: string
          profile_id?: string | null
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_lb_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          attachment_url: string | null
          created_at: string
          days: number
          from_date: string
          id: string
          leave_type: string
          organization_id: string
          profile_id: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          days?: number
          from_date: string
          id?: string
          leave_type: string
          organization_id?: string
          profile_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          days?: number
          from_date?: string
          id?: string
          leave_type?: string
          organization_id?: string
          profile_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_lr_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          color: string
          created_at: string
          default_days: number
          icon: string
          id: string
          is_active: boolean
          key: string
          label: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          default_days?: number
          icon?: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          default_days?: number
          icon?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_leave_types_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      master_coa_template: {
        Row: {
          account_code: string
          account_name: string
          account_type: string
          country: string | null
          created_at: string
          description: string | null
          id: string
          is_deletable: boolean
          is_system: boolean
          parent_code: string | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_type: string
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_deletable?: boolean
          is_system?: boolean
          parent_code?: string | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_type?: string
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_deletable?: boolean
          is_system?: boolean
          parent_code?: string | null
        }
        Relationships: []
      }
      master_ctc_components: {
        Row: {
          component_name: string
          component_type: string
          created_at: string
          default_percentage_of_basic: number | null
          display_order: number
          id: string
          is_active: boolean
          is_taxable: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          component_name: string
          component_type?: string
          created_at?: string
          default_percentage_of_basic?: number | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          component_name?: string
          component_type?: string
          created_at?: string
          default_percentage_of_basic?: number | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_ctc_components_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      material_consumption: {
        Row: {
          actual_quantity: number
          consumed_at: string
          created_at: string
          id: string
          item_id: string | null
          material_name: string
          organization_id: string
          planned_quantity: number
          warehouse_id: string | null
          wastage_quantity: number
          work_order_id: string
        }
        Insert: {
          actual_quantity?: number
          consumed_at?: string
          created_at?: string
          id?: string
          item_id?: string | null
          material_name: string
          organization_id: string
          planned_quantity?: number
          warehouse_id?: string | null
          wastage_quantity?: number
          work_order_id: string
        }
        Update: {
          actual_quantity?: number
          consumed_at?: string
          created_at?: string
          id?: string
          item_id?: string | null
          material_name?: string
          organization_id?: string
          planned_quantity?: number
          warehouse_id?: string | null
          wastage_quantity?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_consumption_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_consumption_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      memos: {
        Row: {
          attachment_url: string | null
          author_name: string
          content: string | null
          created_at: string
          department: string
          excerpt: string | null
          id: string
          organization_id: string
          priority: string
          published_at: string | null
          recipients: string[] | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          subject: string | null
          title: string
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          attachment_url?: string | null
          author_name: string
          content?: string | null
          created_at?: string
          department?: string
          excerpt?: string | null
          id?: string
          organization_id?: string
          priority?: string
          published_at?: string | null
          recipients?: string[] | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          subject?: string | null
          title: string
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          attachment_url?: string | null
          author_name?: string
          content?: string | null
          created_at?: string
          department?: string
          excerpt?: string | null
          id?: string
          organization_id?: string
          priority?: string
          published_at?: string | null
          recipients?: string[] | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          subject?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_memos_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          metadata: Json | null
          organization_id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          organization_id?: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          organization_id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notif_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_snapshots: {
        Row: {
          config_hash: string
          id: string
          initialized_at: string
          organization_id: string
          version: number
        }
        Insert: {
          config_hash: string
          id?: string
          initialized_at?: string
          organization_id: string
          version?: number
        }
        Update: {
          config_hash?: string
          id?: string
          initialized_at?: string
          organization_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_compliance: {
        Row: {
          accounting_method: string | null
          authorized_signatory_name: string | null
          base_currency: string | null
          books_start_date: string | null
          brand_color: string | null
          cin_or_llpin: string | null
          coa_confirmed: boolean | null
          created_at: string | null
          einvoice_applicable: boolean | null
          entity_type: string | null
          esi_applicable: boolean | null
          ewaybill_applicable: boolean | null
          filing_frequency: string | null
          financial_year_start: string | null
          gratuity_applicable: boolean | null
          gstin: string[] | null
          id: string
          industry_template: string | null
          itc_eligible: boolean | null
          legal_name: string | null
          logo_url: string | null
          msme_status: boolean | null
          organization_id: string
          pan: string | null
          payroll_enabled: boolean | null
          payroll_frequency: string | null
          pf_applicable: boolean | null
          phase1_completed_at: string | null
          phase2_completed_at: string | null
          pincode: string | null
          professional_tax_applicable: boolean | null
          registered_address: string | null
          registration_type: string | null
          reverse_charge_applicable: boolean | null
          signature_url: string | null
          state: string | null
          tan: string | null
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          accounting_method?: string | null
          authorized_signatory_name?: string | null
          base_currency?: string | null
          books_start_date?: string | null
          brand_color?: string | null
          cin_or_llpin?: string | null
          coa_confirmed?: boolean | null
          created_at?: string | null
          einvoice_applicable?: boolean | null
          entity_type?: string | null
          esi_applicable?: boolean | null
          ewaybill_applicable?: boolean | null
          filing_frequency?: string | null
          financial_year_start?: string | null
          gratuity_applicable?: boolean | null
          gstin?: string[] | null
          id?: string
          industry_template?: string | null
          itc_eligible?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          msme_status?: boolean | null
          organization_id: string
          pan?: string | null
          payroll_enabled?: boolean | null
          payroll_frequency?: string | null
          pf_applicable?: boolean | null
          phase1_completed_at?: string | null
          phase2_completed_at?: string | null
          pincode?: string | null
          professional_tax_applicable?: boolean | null
          registered_address?: string | null
          registration_type?: string | null
          reverse_charge_applicable?: boolean | null
          signature_url?: string | null
          state?: string | null
          tan?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          accounting_method?: string | null
          authorized_signatory_name?: string | null
          base_currency?: string | null
          books_start_date?: string | null
          brand_color?: string | null
          cin_or_llpin?: string | null
          coa_confirmed?: boolean | null
          created_at?: string | null
          einvoice_applicable?: boolean | null
          entity_type?: string | null
          esi_applicable?: boolean | null
          ewaybill_applicable?: boolean | null
          filing_frequency?: string | null
          financial_year_start?: string | null
          gratuity_applicable?: boolean | null
          gstin?: string[] | null
          id?: string
          industry_template?: string | null
          itc_eligible?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          msme_status?: boolean | null
          organization_id?: string
          pan?: string | null
          payroll_enabled?: boolean | null
          payroll_frequency?: string | null
          pf_applicable?: boolean | null
          phase1_completed_at?: string | null
          phase2_completed_at?: string | null
          pincode?: string | null
          professional_tax_applicable?: boolean | null
          registered_address?: string | null
          registration_type?: string | null
          reverse_charge_applicable?: boolean | null
          signature_url?: string | null
          state?: string | null
          tan?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_compliance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          connected_at: string | null
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          id: string
          organization_id: string
          provider: string
          provider_tenant_id: string | null
          scopes: string | null
          status: string | null
        }
        Insert: {
          connected_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          organization_id: string
          provider: string
          provider_tenant_id?: string | null
          scopes?: string | null
          status?: string | null
        }
        Update: {
          connected_at?: string | null
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          organization_id?: string
          provider?: string
          provider_tenant_id?: string | null
          scopes?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_oauth_configs: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string | null
          created_by: string | null
          id: string
          is_verified: boolean | null
          organization_id: string
          provider: string
          scopes: string[] | null
          sender_email: string | null
          tenant_id: string | null
          updated_at: string | null
          verified_at: string | null
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_verified?: boolean | null
          organization_id: string
          provider: string
          scopes?: string[] | null
          sender_email?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          verified_at?: string | null
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_verified?: boolean | null
          organization_id?: string
          provider?: string
          scopes?: string[] | null
          sender_email?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_oauth_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_roles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          organization_id: string
          role_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          organization_id: string
          role_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          organization_id?: string
          role_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          favicon_url: string | null
          id: string
          logo_url: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          auto_reset_enabled: boolean
          created_at: string
          environment_type: string
          id: string
          name: string
          onboarding_reinitiated_at: string | null
          onboarding_reinitiated_by: string | null
          onboarding_version: number | null
          org_state: string
          sandbox_expires_at: string | null
          sandbox_owner: string | null
          settings: Json | null
          slug: string | null
          status: string
          updated_at: string
          weekend_policy: string
        }
        Insert: {
          auto_reset_enabled?: boolean
          created_at?: string
          environment_type?: string
          id?: string
          name: string
          onboarding_reinitiated_at?: string | null
          onboarding_reinitiated_by?: string | null
          onboarding_version?: number | null
          org_state?: string
          sandbox_expires_at?: string | null
          sandbox_owner?: string | null
          settings?: Json | null
          slug?: string | null
          status?: string
          updated_at?: string
          weekend_policy?: string
        }
        Update: {
          auto_reset_enabled?: boolean
          created_at?: string
          environment_type?: string
          id?: string
          name?: string
          onboarding_reinitiated_at?: string | null
          onboarding_reinitiated_by?: string | null
          onboarding_version?: number | null
          org_state?: string
          sandbox_expires_at?: string | null
          sandbox_owner?: string | null
          settings?: Json | null
          slug?: string | null
          status?: string
          updated_at?: string
          weekend_policy?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          created_by: string
          customer_id: string | null
          customer_name: string
          id: string
          invoice_id: string | null
          notes: string | null
          organization_id: string
          payment_date: string
          payment_method: string
          receipt_number: string
          reference_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          customer_name: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          organization_id: string
          payment_date?: string
          payment_method?: string
          receipt_number: string
          reference_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: string
          receipt_number?: string
          reference_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          annual_ctc: number
          annual_ctc_snapshot: number | null
          compensation_structure_id: string | null
          created_at: string
          deductions_breakdown: Json
          earnings_breakdown: Json
          esi_employee: number | null
          esi_employer: number | null
          gross_earnings: number
          id: string
          lwp_days: number
          lwp_deduction: number
          net_pay: number
          organization_id: string
          paid_days: number
          payroll_run_id: string
          payslip_generated_at: string | null
          payslip_url: string | null
          per_day_salary: number | null
          pf_employee: number | null
          pf_employer: number | null
          profile_id: string
          status: string
          tds_amount: number | null
          total_deductions: number
          updated_at: string
          working_days: number
        }
        Insert: {
          annual_ctc?: number
          annual_ctc_snapshot?: number | null
          compensation_structure_id?: string | null
          created_at?: string
          deductions_breakdown?: Json
          earnings_breakdown?: Json
          esi_employee?: number | null
          esi_employer?: number | null
          gross_earnings?: number
          id?: string
          lwp_days?: number
          lwp_deduction?: number
          net_pay?: number
          organization_id: string
          paid_days?: number
          payroll_run_id: string
          payslip_generated_at?: string | null
          payslip_url?: string | null
          per_day_salary?: number | null
          pf_employee?: number | null
          pf_employer?: number | null
          profile_id: string
          status?: string
          tds_amount?: number | null
          total_deductions?: number
          updated_at?: string
          working_days?: number
        }
        Update: {
          annual_ctc?: number
          annual_ctc_snapshot?: number | null
          compensation_structure_id?: string | null
          created_at?: string
          deductions_breakdown?: Json
          earnings_breakdown?: Json
          esi_employee?: number | null
          esi_employer?: number | null
          gross_earnings?: number
          id?: string
          lwp_days?: number
          lwp_deduction?: number
          net_pay?: number
          organization_id?: string
          paid_days?: number
          payroll_run_id?: string
          payslip_generated_at?: string | null
          payslip_url?: string | null
          per_day_salary?: number | null
          pf_employee?: number | null
          pf_employer?: number | null
          profile_id?: string
          status?: string
          tds_amount?: number | null
          total_deductions?: number
          updated_at?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_compensation_structure_id_fkey"
            columns: ["compensation_structure_id"]
            isOneToOne: false
            referencedRelation: "compensation_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          basic_salary: number
          created_at: string
          hra: number
          id: string
          is_superseded: boolean
          lop_days: number
          lop_deduction: number
          net_pay: number
          notes: string | null
          organization_id: string
          original_record_id: string | null
          other_allowances: number
          other_deductions: number
          paid_days: number
          pay_period: string
          pf_deduction: number
          processed_at: string | null
          profile_id: string | null
          status: string
          superseded_by: string | null
          tax_deduction: number
          transport_allowance: number
          updated_at: string
          user_id: string
          version: number
          working_days: number
        }
        Insert: {
          basic_salary?: number
          created_at?: string
          hra?: number
          id?: string
          is_superseded?: boolean
          lop_days?: number
          lop_deduction?: number
          net_pay?: number
          notes?: string | null
          organization_id?: string
          original_record_id?: string | null
          other_allowances?: number
          other_deductions?: number
          paid_days?: number
          pay_period: string
          pf_deduction?: number
          processed_at?: string | null
          profile_id?: string | null
          status?: string
          superseded_by?: string | null
          tax_deduction?: number
          transport_allowance?: number
          updated_at?: string
          user_id: string
          version?: number
          working_days?: number
        }
        Update: {
          basic_salary?: number
          created_at?: string
          hra?: number
          id?: string
          is_superseded?: boolean
          lop_days?: number
          lop_deduction?: number
          net_pay?: number
          notes?: string | null
          organization_id?: string
          original_record_id?: string | null
          other_allowances?: number
          other_deductions?: number
          paid_days?: number
          pay_period?: string
          pf_deduction?: number
          processed_at?: string | null
          profile_id?: string | null
          status?: string
          superseded_by?: string | null
          tax_deduction?: number
          transport_allowance?: number
          updated_at?: string
          user_id?: string
          version?: number
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_original_record_id_fkey"
            columns: ["original_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_count: number
          generated_by: string
          id: string
          locked_at: string | null
          locked_by: string | null
          notes: string | null
          organization_id: string
          pay_period: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_count?: number
          generated_by: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          organization_id: string
          pay_period: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_count?: number
          generated_by?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          notes?: string | null
          organization_id?: string
          pay_period?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_disputes: {
        Row: {
          created_at: string
          description: string
          dispute_category: string
          finance_notes: string | null
          finance_reviewed_at: string | null
          finance_reviewed_by: string | null
          hr_notes: string | null
          hr_reviewed_at: string | null
          hr_reviewed_by: string | null
          id: string
          manager_notes: string | null
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          organization_id: string
          pay_period: string
          payroll_record_id: string
          profile_id: string
          resolution_notes: string | null
          resolved_at: string | null
          revised_payroll_record_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          dispute_category?: string
          finance_notes?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          hr_notes?: string | null
          hr_reviewed_at?: string | null
          hr_reviewed_by?: string | null
          id?: string
          manager_notes?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          organization_id: string
          pay_period: string
          payroll_record_id: string
          profile_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          revised_payroll_record_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          dispute_category?: string
          finance_notes?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          hr_notes?: string | null
          hr_reviewed_at?: string | null
          hr_reviewed_by?: string | null
          id?: string
          manager_notes?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          organization_id?: string
          pay_period?: string
          payroll_record_id?: string
          profile_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          revised_payroll_record_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslip_disputes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_disputes_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_disputes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_disputes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_disputes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_disputes_revised_payroll_record_id_fkey"
            columns: ["revised_payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
        ]
      }
      period_close_logs: {
        Row: {
          all_checks_passed: boolean
          closed_at: string
          closed_by: string
          fiscal_period_id: string
          id: string
          organization_id: string
          pre_close_checks: Json
        }
        Insert: {
          all_checks_passed?: boolean
          closed_at?: string
          closed_by: string
          fiscal_period_id: string
          id?: string
          organization_id: string
          pre_close_checks?: Json
        }
        Update: {
          all_checks_passed?: boolean
          closed_at?: string
          closed_by?: string
          fiscal_period_id?: string
          id?: string
          organization_id?: string
          pre_close_checks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "period_close_logs_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_close_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_list_items: {
        Row: {
          bin_id: string | null
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          picked_quantity: number
          picking_list_id: string
          required_quantity: number
          status: string
        }
        Insert: {
          bin_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          picked_quantity?: number
          picking_list_id: string
          required_quantity?: number
          status?: string
        }
        Update: {
          bin_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          picked_quantity?: number
          picking_list_id?: string
          required_quantity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_list_items_bin_id_fkey"
            columns: ["bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_list_items_picking_list_id_fkey"
            columns: ["picking_list_id"]
            isOneToOne: false
            referencedRelation: "picking_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_lists: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          pick_number: string
          sales_order_id: string | null
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          pick_number: string
          sales_order_id?: string | null
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          pick_number?: string
          sales_order_id?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_lists_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_lists_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admin_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          target_id: string | null
          target_name: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_name?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_change_requests: {
        Row: {
          created_at: string
          current_value: string | null
          field_name: string
          id: string
          organization_id: string
          profile_id: string
          reason: string | null
          requested_value: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          section: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: string | null
          field_name: string
          id?: string
          organization_id: string
          profile_id: string
          reason?: string | null
          requested_value?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          section: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: string | null
          field_name?: string
          id?: string
          organization_id?: string
          profile_id?: string
          reason?: string | null
          requested_value?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          section?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string | null
          employee_id: string | null
          esi_eligible: boolean | null
          full_name: string | null
          id: string
          job_title: string | null
          join_date: string | null
          manager_id: string | null
          organization_id: string
          phone: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_id?: string | null
          esi_eligible?: boolean | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          join_date?: string | null
          manager_id?: string | null
          organization_id?: string
          phone?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_id?: string | null
          esi_eligible?: boolean | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          join_date?: string | null
          manager_id?: string | null
          organization_id?: string
          phone?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string | null
          purchase_order_id: string
          quantity: number
          received_quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          purchase_order_id: string
          quantity?: number
          received_quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          currency_code: string | null
          exchange_rate: number | null
          expected_date: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          organization_id: string
          po_number: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          currency_code?: string | null
          exchange_rate?: number | null
          expected_date?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          organization_id: string
          po_number: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string | null
          exchange_rate?: number | null
          expected_date?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          organization_id?: string
          po_number?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string | null
          purchase_return_id: string
          quantity: number
          reason: string | null
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          purchase_return_id: string
          quantity?: number
          reason?: string | null
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          purchase_return_id?: string
          quantity?: number
          reason?: string | null
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string
          created_by: string
          goods_receipt_id: string | null
          id: string
          notes: string | null
          organization_id: string
          purchase_order_id: string | null
          reason: string | null
          return_date: string
          return_number: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_credit_id: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          goods_receipt_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          purchase_order_id?: string | null
          reason?: string | null
          return_date?: string
          return_number: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_credit_id?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          goods_receipt_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          purchase_order_id?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_credit_id?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          amount: number
          cgst_amount: number
          cgst_rate: number
          created_at: string
          description: string
          hsn_sac: string | null
          id: string
          igst_amount: number
          igst_rate: number
          quantity: number
          quote_id: string
          rate: number
          sgst_amount: number
          sgst_rate: number
        }
        Insert: {
          amount: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          description: string
          hsn_sac?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          quantity?: number
          quote_id: string
          rate: number
          sgst_amount?: number
          sgst_rate?: number
        }
        Update: {
          amount?: number
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          description?: string
          hsn_sac?: string | null
          id?: string
          igst_amount?: number
          igst_rate?: number
          quantity?: number
          quote_id?: string
          rate?: number
          sgst_amount?: number
          sgst_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          amount: number
          cgst_total: number
          client_email: string | null
          client_name: string
          converted_invoice_id: string | null
          created_at: string
          customer_gstin: string | null
          customer_id: string | null
          due_date: string
          id: string
          igst_total: number
          notes: string | null
          organization_id: string
          payment_terms: string | null
          place_of_supply: string | null
          quote_number: string
          sgst_total: number
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          cgst_total?: number
          client_email?: string | null
          client_name: string
          converted_invoice_id?: string | null
          created_at?: string
          customer_gstin?: string | null
          customer_id?: string | null
          due_date: string
          id?: string
          igst_total?: number
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          place_of_supply?: string | null
          quote_number: string
          sgst_total?: number
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          cgst_total?: number
          client_email?: string | null
          client_name?: string
          converted_invoice_id?: string | null
          created_at?: string
          customer_gstin?: string | null
          customer_id?: string | null
          due_date?: string
          id?: string
          igst_total?: number
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          place_of_supply?: string | null
          quote_number?: string
          sgst_total?: number
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_quotes_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          credit_account_id: string | null
          currency: string
          debit_account_id: string | null
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          last_run_date: string | null
          name: string
          next_run_date: string | null
          notes: string | null
          organization_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by: string
          credit_account_id?: string | null
          currency?: string
          debit_account_id?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          name: string
          next_run_date?: string | null
          notes?: string | null
          organization_id: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          credit_account_id?: string | null
          currency?: string
          debit_account_id?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          last_run_date?: string | null
          name?: string
          next_run_date?: string | null
          notes?: string | null
          organization_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursement_requests: {
        Row: {
          ai_extracted: boolean
          ai_raw_data: Json | null
          amount: number
          attachment_url: string | null
          category: string | null
          created_at: string
          description: string | null
          expense_date: string | null
          expense_id: string | null
          file_name: string | null
          file_type: string | null
          finance_notes: string | null
          finance_reviewed_at: string | null
          finance_reviewed_by: string | null
          id: string
          manager_notes: string | null
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          organization_id: string
          profile_id: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          vendor_name: string | null
        }
        Insert: {
          ai_extracted?: boolean
          ai_raw_data?: Json | null
          amount?: number
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string | null
          expense_id?: string | null
          file_name?: string | null
          file_type?: string | null
          finance_notes?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          id?: string
          manager_notes?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          organization_id?: string
          profile_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          vendor_name?: string | null
        }
        Update: {
          ai_extracted?: boolean
          ai_raw_data?: Json | null
          amount?: number
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string | null
          expense_id?: string | null
          file_name?: string | null
          file_type?: string | null
          finance_notes?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          id?: string
          manager_notes?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          organization_id?: string
          profile_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_reimb_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_requests_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursement_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string | null
          quantity: number
          sales_order_id: string
          shipped_quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          quantity?: number
          sales_order_id: string
          shipped_quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          quantity?: number
          sales_order_id?: string
          shipped_quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          currency_code: string | null
          customer_id: string | null
          customer_name: string
          exchange_rate: number | null
          expected_date: string | null
          expected_delivery: string | null
          id: string
          notes: string | null
          order_date: string
          organization_id: string
          quote_id: string | null
          so_number: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          currency_code?: string | null
          customer_id?: string | null
          customer_name: string
          exchange_rate?: number | null
          expected_date?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          organization_id: string
          quote_id?: string | null
          so_number: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string | null
          customer_id?: string | null
          customer_name?: string
          exchange_rate?: number | null
          expected_date?: string | null
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          organization_id?: string
          quote_id?: string | null
          so_number?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string | null
          quantity: number
          reason: string | null
          sales_return_id: string
          tax_rate: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          quantity?: number
          reason?: string | null
          sales_return_id: string
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          quantity?: number
          reason?: string | null
          sales_return_id?: string
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          created_at: string
          created_by: string
          credit_note_id: string | null
          customer_id: string | null
          customer_name: string
          delivery_note_id: string | null
          id: string
          notes: string | null
          organization_id: string
          reason: string | null
          return_date: string
          return_number: string
          sales_order_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          credit_note_id?: string | null
          customer_id?: string | null
          customer_name: string
          delivery_note_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reason?: string | null
          return_date?: string
          return_number: string
          sales_order_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          credit_note_id?: string | null
          customer_id?: string | null
          customer_name?: string
          delivery_note_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reason?: string | null
          return_date?: string
          return_number?: string
          sales_order_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_invite_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          sandbox_org_id: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          sandbox_org_id: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          sandbox_org_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_invite_links_sandbox_org_id_fkey"
            columns: ["sandbox_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_users: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          persona_role: string
          sandbox_org_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          id?: string
          persona_role: string
          sandbox_org_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          persona_role?: string
          sandbox_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_users_sandbox_org_id_fkey"
            columns: ["sandbox_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_payments: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          due_date: string
          id: string
          name: string
          organization_id: string
          payment_type: string
          recurrence_interval: string | null
          recurring: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          due_date: string
          id?: string
          name: string
          organization_id?: string
          payment_type?: string
          recurrence_interval?: string | null
          recurring?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          due_date?: string
          id?: string
          name?: string
          organization_id?: string
          payment_type?: string
          recurrence_interval?: string | null
          recurring?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sched_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      session_policies: {
        Row: {
          created_at: string
          enforce_single_session: boolean
          id: string
          idle_timeout_minutes: number
          max_session_hours: number
          organization_id: string
          password_min_length: number
          password_require_number: boolean
          password_require_special: boolean
          password_require_uppercase: boolean
          require_mfa: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enforce_single_session?: boolean
          id?: string
          idle_timeout_minutes?: number
          max_session_hours?: number
          organization_id: string
          password_min_length?: number
          password_require_number?: boolean
          password_require_special?: boolean
          password_require_uppercase?: boolean
          require_mfa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enforce_single_session?: boolean
          id?: string
          idle_timeout_minutes?: number
          max_session_hours?: number
          organization_id?: string
          password_min_length?: number
          password_require_number?: boolean
          password_require_special?: boolean
          password_require_uppercase?: boolean
          require_mfa?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_customers: {
        Row: {
          created_at: string
          customer_payload: Json | null
          email: string | null
          id: string
          name: string | null
          organization_id: string
          phone: string | null
          shopify_customer_id: string
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          customer_payload?: Json | null
          email?: string | null
          id?: string
          name?: string | null
          organization_id: string
          phone?: string | null
          shopify_customer_id: string
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          customer_payload?: Json | null
          email?: string | null
          id?: string
          name?: string | null
          organization_id?: string
          phone?: string | null
          shopify_customer_id?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_orders: {
        Row: {
          created_at: string
          currency: string | null
          customer_id: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          order_number: string | null
          order_payload: Json | null
          order_total: number
          organization_id: string
          shopify_order_id: string
          synced_at: string | null
          tax_total: number
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          order_number?: string | null
          order_payload?: Json | null
          order_total?: number
          organization_id: string
          shopify_order_id: string
          synced_at?: string | null
          tax_total?: number
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          order_number?: string | null
          order_payload?: Json | null
          order_total?: number
          organization_id?: string
          shopify_order_id?: string
          synced_at?: string | null
          tax_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopify_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_products: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          price: number | null
          product_payload: Json | null
          shopify_product_id: string
          sku: string | null
          synced_at: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          price?: number | null
          product_payload?: Json | null
          shopify_product_id: string
          sku?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          price?: number | null
          product_payload?: Json | null
          shopify_product_id?: string
          sku?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_runs: {
        Row: {
          chaos_test_results: Json | null
          completed_at: string | null
          concurrent_users_simulated: number | null
          created_at: string | null
          errors: Json | null
          id: string
          initiated_by: string
          report_html: string | null
          report_json: Json | null
          run_type: string
          sandbox_org_id: string
          seed_summary: Json | null
          started_at: string | null
          status: string
          stress_test_results: Json | null
          total_execution_time_ms: number | null
          total_records_created: number | null
          updated_at: string | null
          validation_details: Json | null
          validation_passed: boolean | null
          workflow_details: Json | null
          workflows_executed: number | null
          workflows_failed: number | null
          workflows_passed: number | null
        }
        Insert: {
          chaos_test_results?: Json | null
          completed_at?: string | null
          concurrent_users_simulated?: number | null
          created_at?: string | null
          errors?: Json | null
          id?: string
          initiated_by: string
          report_html?: string | null
          report_json?: Json | null
          run_type?: string
          sandbox_org_id: string
          seed_summary?: Json | null
          started_at?: string | null
          status?: string
          stress_test_results?: Json | null
          total_execution_time_ms?: number | null
          total_records_created?: number | null
          updated_at?: string | null
          validation_details?: Json | null
          validation_passed?: boolean | null
          workflow_details?: Json | null
          workflows_executed?: number | null
          workflows_failed?: number | null
          workflows_passed?: number | null
        }
        Update: {
          chaos_test_results?: Json | null
          completed_at?: string | null
          concurrent_users_simulated?: number | null
          created_at?: string | null
          errors?: Json | null
          id?: string
          initiated_by?: string
          report_html?: string | null
          report_json?: Json | null
          run_type?: string
          sandbox_org_id?: string
          seed_summary?: Json | null
          started_at?: string | null
          status?: string
          stress_test_results?: Json | null
          total_execution_time_ms?: number | null
          total_records_created?: number | null
          updated_at?: string | null
          validation_details?: Json | null
          validation_passed?: boolean | null
          workflow_details?: Json | null
          workflows_executed?: number | null
          workflows_failed?: number | null
          workflows_passed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "simulation_runs_sandbox_org_id_fkey"
            columns: ["sandbox_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      state_leave_rules: {
        Row: {
          carry_forward_allowed: boolean | null
          casual_leave_days: number
          created_at: string | null
          earned_leave_days: number
          effective_from: string
          id: string
          maternity_leave_days: number
          max_carry_forward_days: number | null
          max_work_hours_per_week: number | null
          min_days_for_el_accrual: number | null
          notes: string | null
          organization_id: string
          overtime_rate_multiplier: number | null
          paternity_leave_days: number
          sick_leave_days: number
          state_code: string
          state_name: string
          updated_at: string | null
          weekly_off_count: number | null
        }
        Insert: {
          carry_forward_allowed?: boolean | null
          casual_leave_days?: number
          created_at?: string | null
          earned_leave_days?: number
          effective_from?: string
          id?: string
          maternity_leave_days?: number
          max_carry_forward_days?: number | null
          max_work_hours_per_week?: number | null
          min_days_for_el_accrual?: number | null
          notes?: string | null
          organization_id: string
          overtime_rate_multiplier?: number | null
          paternity_leave_days?: number
          sick_leave_days?: number
          state_code: string
          state_name: string
          updated_at?: string | null
          weekly_off_count?: number | null
        }
        Update: {
          carry_forward_allowed?: boolean | null
          casual_leave_days?: number
          created_at?: string | null
          earned_leave_days?: number
          effective_from?: string
          id?: string
          maternity_leave_days?: number
          max_carry_forward_days?: number | null
          max_work_hours_per_week?: number | null
          min_days_for_el_accrual?: number | null
          notes?: string | null
          organization_id?: string
          overtime_rate_multiplier?: number | null
          paternity_leave_days?: number
          sick_leave_days?: number
          state_code?: string
          state_name?: string
          updated_at?: string | null
          weekly_off_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "state_leave_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_items: {
        Row: {
          adjustment_id: string
          created_at: string
          current_qty: number
          difference_qty: number | null
          id: string
          item_id: string
          new_qty: number
          rate: number
          reason: string | null
          value_impact: number | null
        }
        Insert: {
          adjustment_id: string
          created_at?: string
          current_qty?: number
          difference_qty?: number | null
          id?: string
          item_id: string
          new_qty?: number
          rate?: number
          reason?: string | null
          value_impact?: number | null
        }
        Update: {
          adjustment_id?: string
          created_at?: string
          current_qty?: number
          difference_qty?: number | null
          id?: string
          item_id?: string
          new_qty?: number
          rate?: number
          reason?: string | null
          value_impact?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          reason: string
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_number: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          reason: string
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          reason?: string
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_ledger: {
        Row: {
          balance_qty: number
          balance_value: number
          batch_no: string | null
          created_at: string
          id: string
          item_id: string
          notes: string | null
          organization_id: string
          posted_at: string
          posted_by: string | null
          quantity: number
          rate: number
          reference_id: string | null
          reference_type: string | null
          serial_no: string | null
          transaction_type: string
          value: number
          warehouse_id: string
        }
        Insert: {
          balance_qty?: number
          balance_value?: number
          batch_no?: string | null
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          organization_id: string
          posted_at?: string
          posted_by?: string | null
          quantity: number
          rate?: number
          reference_id?: string | null
          reference_type?: string | null
          serial_no?: string | null
          transaction_type: string
          value?: number
          warehouse_id: string
        }
        Update: {
          balance_qty?: number
          balance_value?: number
          batch_no?: string | null
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          organization_id?: string
          posted_at?: string
          posted_by?: string | null
          quantity?: number
          rate?: number
          reference_id?: string | null
          reference_type?: string | null
          serial_no?: string | null
          transaction_type?: string
          value?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          from_bin_id: string | null
          id: string
          item_id: string | null
          item_name: string
          quantity: number
          to_bin_id: string | null
          transfer_id: string
        }
        Insert: {
          created_at?: string
          from_bin_id?: string | null
          id?: string
          item_id?: string | null
          item_name: string
          quantity?: number
          to_bin_id?: string | null
          transfer_id: string
        }
        Update: {
          created_at?: string
          from_bin_id?: string | null
          id?: string
          item_id?: string | null
          item_name?: string
          quantity?: number
          to_bin_id?: string | null
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_from_bin_id_fkey"
            columns: ["from_bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_to_bin_id_fkey"
            columns: ["to_bin_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string
          from_warehouse_id: string
          id: string
          notes: string | null
          organization_id: string
          received_at: string | null
          received_by: string | null
          status: string
          to_warehouse_id: string
          transfer_date: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_warehouse_id: string
          id?: string
          notes?: string | null
          organization_id: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          to_warehouse_id: string
          transfer_date?: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          to_warehouse_id?: string
          transfer_date?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subledger_reconciliation_log: {
        Row: {
          created_at: string
          details: Json | null
          gl_balance: number
          id: string
          is_reconciled: boolean
          module: string
          organization_id: string
          reconciliation_date: string
          subledger_balance: number
          variance: number
        }
        Insert: {
          created_at?: string
          details?: Json | null
          gl_balance?: number
          id?: string
          is_reconciled?: boolean
          module: string
          organization_id: string
          reconciliation_date?: string
          subledger_balance?: number
          variance?: number
        }
        Update: {
          created_at?: string
          details?: Json | null
          gl_balance?: number
          id?: string
          is_reconciled?: boolean
          module?: string
          organization_id?: string
          reconciliation_date?: string
          subledger_balance?: number
          variance?: number
        }
        Relationships: [
          {
            foreignKeyName: "subledger_reconciliation_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_keys: {
        Row: {
          created_at: string
          created_by: string | null
          enabled_modules: string[]
          expires_at: string | null
          id: string
          key_hash: string
          max_uses: number
          plan: string
          status: string
          used_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled_modules?: string[]
          expires_at?: string | null
          id?: string
          key_hash: string
          max_uses?: number
          plan: string
          status?: string
          used_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled_modules?: string[]
          expires_at?: string | null
          id?: string
          key_hash?: string
          max_uses?: number
          plan?: string
          status?: string
          used_count?: number
        }
        Relationships: []
      }
      subscription_redemptions: {
        Row: {
          id: string
          organization_id: string
          redeemed_at: string
          redeemed_by: string | null
          subscription_key_id: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          redeemed_at?: string
          redeemed_by?: string | null
          subscription_key_id?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          redeemed_at?: string
          redeemed_by?: string | null
          subscription_key_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_redemptions_subscription_key_id_fkey"
            columns: ["subscription_key_id"]
            isOneToOne: false
            referencedRelation: "subscription_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          enabled_modules: string[]
          id: string
          is_read_only: boolean
          organization_id: string
          plan: string
          source: string
          status: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          enabled_modules?: string[]
          id?: string
          is_read_only?: boolean
          organization_id: string
          plan: string
          source: string
          status: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          enabled_modules?: string[]
          id?: string
          is_read_only?: boolean
          organization_id?: string
          plan?: string
          source?: string
          status?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_regimes: {
        Row: {
          created_at: string | null
          description: string | null
          financial_year: string
          id: string
          is_default: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          financial_year?: string
          id?: string
          is_default?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          financial_year?: string
          id?: string
          is_default?: boolean | null
          name?: string
        }
        Relationships: []
      }
      tax_slabs: {
        Row: {
          cess_percentage: number
          created_at: string | null
          id: string
          income_from: number
          income_to: number
          regime_id: string
          tax_percentage: number
        }
        Insert: {
          cess_percentage?: number
          created_at?: string | null
          id?: string
          income_from?: number
          income_to?: number
          regime_id: string
          tax_percentage?: number
        }
        Update: {
          cess_percentage?: number
          created_at?: string | null
          id?: string
          income_from?: number
          income_to?: number
          regime_id?: string
          tax_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_slabs_regime_id_fkey"
            columns: ["regime_id"]
            isOneToOne: false
            referencedRelation: "tax_regimes"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          abbreviation: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          session_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          session_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          session_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vendor_credits: {
        Row: {
          amount: number
          bill_id: string | null
          created_at: string
          id: string
          issue_date: string
          organization_id: string
          reason: string | null
          status: string
          updated_at: string
          user_id: string
          vendor_credit_number: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount: number
          bill_id?: string | null
          created_at?: string
          id?: string
          issue_date?: string
          organization_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vendor_credit_number: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          bill_id?: string | null
          created_at?: string
          id?: string
          issue_date?: string
          organization_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vendor_credit_number?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_vc_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credits_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_credits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          bill_id: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          payment_date: string
          payment_method: string
          payment_number: string
          reference_number: string | null
          status: string
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          bill_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          payment_date?: string
          payment_method?: string
          payment_number: string
          reference_number?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bill_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: string
          payment_number?: string
          reference_number?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bank_account: string | null
          city: string | null
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          payment_terms: string | null
          phone: string | null
          status: string
          tax_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          city?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_vendors_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wage_payment_deadlines: {
        Row: {
          actual_payment_date: string | null
          created_at: string | null
          deadline_date: string
          employee_count: number
          employee_threshold: number
          id: string
          notes: string | null
          organization_id: string
          pay_period: string
          penalty_applicable: boolean | null
          status: string
          updated_at: string | null
        }
        Insert: {
          actual_payment_date?: string | null
          created_at?: string | null
          deadline_date: string
          employee_count?: number
          employee_threshold?: number
          id?: string
          notes?: string | null
          organization_id: string
          pay_period: string
          penalty_applicable?: boolean | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          actual_payment_date?: string | null
          created_at?: string | null
          deadline_date?: string
          employee_count?: number
          employee_threshold?: number
          id?: string
          notes?: string | null
          organization_id?: string
          pay_period?: string
          penalty_applicable?: boolean | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wage_payment_deadlines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          capacity_units: number | null
          city: string | null
          code: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          current_utilization: number | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          pincode: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity_units?: number | null
          city?: string | null
          code: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          current_utilization?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity_units?: number | null
          city?: string | null
          code?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          current_utilization?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          bom_id: string | null
          completed_quantity: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          organization_id: string
          planned_end: string | null
          planned_quantity: number
          planned_start: string | null
          priority: string
          product_item_id: string | null
          product_name: string
          rejected_quantity: number
          status: string
          updated_at: string
          warehouse_id: string | null
          wo_number: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          bom_id?: string | null
          completed_quantity?: number
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          organization_id: string
          planned_end?: string | null
          planned_quantity?: number
          planned_start?: string | null
          priority?: string
          product_item_id?: string | null
          product_name: string
          rejected_quantity?: number
          status?: string
          updated_at?: string
          warehouse_id?: string | null
          wo_number: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          bom_id?: string | null
          completed_quantity?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          organization_id?: string
          planned_end?: string | null
          planned_quantity?: number
          planned_start?: string | null
          priority?: string
          product_item_id?: string | null
          product_name?: string
          rejected_quantity?: number
          status?: string
          updated_at?: string
          warehouse_id?: string | null
          wo_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          organization_id: string
          payload: Json
          workflow_run_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          workflow_run_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          created_at: string
          current_step: number
          entity_id: string
          entity_type: string
          id: string
          next_run_at: string
          organization_id: string
          status: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          entity_id: string
          entity_type: string
          id?: string
          next_run_at?: string
          organization_id: string
          status?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          current_step?: number
          entity_id?: string
          entity_type?: string
          id?: string
          next_run_at?: string
          organization_id?: string
          status?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          config: Json
          created_at: string
          id: string
          step_order: number
          step_type: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          step_order: number
          step_type: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          step_order?: number
          step_type?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employee_full_profiles: {
        Row: {
          aadhaar_last_four: string | null
          address_line1: string | null
          address_line2: string | null
          avatar_url: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          blood_group: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          department: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id: string | null
          employee_id_number: string | null
          esi_number: string | null
          full_name: string | null
          gender: string | null
          id: string | null
          job_title: string | null
          join_date: string | null
          manager_id: string | null
          marital_status: string | null
          nationality: string | null
          organization_id: string | null
          pan_number: string | null
          phone: string | null
          pincode: string | null
          state: string | null
          status: string | null
          uan_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_org"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_base: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_name: string | null
          account_type: string | null
          credit: number | null
          debit: number | null
          document_sequence_number: string | null
          document_type: string | null
          entry_date: string | null
          fiscal_period_id: string | null
          is_reversal: boolean | null
          journal_entry_id: string | null
          line_description: string | null
          line_id: string | null
          memo: string | null
          net_amount: number | null
          normal_balance: string | null
          organization_id: string | null
          reversed_entry_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_fiscal_period_id_fkey"
            columns: ["fiscal_period_id"]
            isOneToOne: false
            referencedRelation: "fiscal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_base"
            referencedColumns: ["journal_entry_id"]
          },
          {
            foreignKeyName: "journal_lines_gl_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_attendance_summary: {
        Row: {
          absent_days: number | null
          half_days: number | null
          missing_days: number | null
          month: string | null
          organization_id: string | null
          present_days: number | null
          profile_id: string | null
          total_late_minutes: number | null
          total_ot_minutes: number | null
          total_work_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_daily_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "employee_full_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_daily_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_safe: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department: string | null
          full_name: string | null
          id: string | null
          job_title: string | null
          join_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          full_name?: string | null
          id?: string | null
          job_title?: string | null
          join_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          full_name?: string | null
          id?: string | null
          job_title?: string | null
          join_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_ledger_balance: {
        Args: never
        Returns: {
          is_balanced: boolean
          total_credits: number
          total_debits: number
        }[]
      }
      check_org_access: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      claim_workflow_runs: {
        Args: { p_claim_until: string; p_limit?: number; p_now: string }
        Returns: {
          created_at: string
          current_step: number
          entity_id: string
          entity_type: string
          id: string
          next_run_at: string
          organization_id: string
          status: string
          updated_at: string
          workflow_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_stale_sessions: { Args: never; Returns: undefined }
      clear_sandbox_impersonation: { Args: never; Returns: undefined }
      close_fiscal_period: {
        Args: { _org_id: string; _period_id: string }
        Returns: Json
      }
      complete_phase1_onboarding: { Args: { _org_id: string }; Returns: Json }
      complete_tenant_onboarding: { Args: { _org_id: string }; Returns: Json }
      controlled_org_reinitialize: { Args: { _org_id: string }; Returns: Json }
      create_sandbox_org: {
        Args: { _auto_reset?: boolean; _name: string }
        Returns: string
      }
      delete_sandbox_org: { Args: { _org_id: string }; Returns: undefined }
      fresh_reonboard_tenant: { Args: { _org_id: string }; Returns: Json }
      get_ap_aging: {
        Args: { p_as_of: string; p_org_id: string }
        Returns: {
          aging_bucket: string
          bill_date: string
          bill_id: string
          bill_number: string
          days_overdue: number
          due_date: string
          total_amount: number
          vendor_name: string
        }[]
      }
      get_ar_aging: {
        Args: { p_as_of: string; p_org_id: string }
        Returns: {
          aging_bucket: string
          client_name: string
          days_overdue: number
          due_date: string
          invoice_date: string
          invoice_id: string
          invoice_number: string
          total_amount: number
        }[]
      }
      get_balance_sheet: {
        Args: { p_as_of: string; p_org_id: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          balance: number
        }[]
      }
      get_budget_vs_actual: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          actual_amount: number
          budget_amount: number
          variance: number
          variance_pct: number
        }[]
      }
      get_cash_flow_indirect: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          amount: number
          description: string
          section: string
        }[]
      }
      get_current_org: { Args: never; Returns: string }
      get_current_user_profile_id: { Args: never; Returns: string }
      get_effective_uid: { Args: never; Returns: string }
      get_fiscal_period: {
        Args: { _d: string; _org_id: string }
        Returns: string
      }
      get_general_ledger: {
        Args: {
          p_account_id: string
          p_from: string
          p_org_id: string
          p_to: string
        }
        Returns: {
          credit: number
          debit: number
          description: string
          document_sequence_number: string
          document_type: string
          entry_date: string
          journal_entry_id: string
          running_balance: number
        }[]
      }
      get_gl_account_id: {
        Args: { _code: string; _org_id: string }
        Returns: string
      }
      get_profit_loss: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          amount: number
        }[]
      }
      get_profit_loss_comparative: {
        Args: {
          p_from_1: string
          p_from_2: string
          p_org_id: string
          p_to_1: string
          p_to_2: string
        }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          period_1: number
          period_2: number
          variance: number
          variance_pct: number
        }[]
      }
      get_trial_balance: {
        Args: { p_from: string; p_org_id: string; p_to: string }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          account_type: string
          net_balance: number
          normal_balance: string
          total_credit: number
          total_debit: number
        }[]
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_financial_os: {
        Args: { _calibration?: Json; _force?: boolean; _org_id: string }
        Returns: Json
      }
      inspect_database_structure: { Args: never; Returns: Json }
      is_admin_hr_or_manager: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_finance: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_hr: { Args: { _user_id: string }; Returns: boolean }
      is_manager_of_profile: {
        Args: { _profile_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_active: { Args: { _org_id: string }; Returns: boolean }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_admin_hr_or_manager: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_admin_or_finance: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_admin_or_hr: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      join_sandbox_via_token: {
        Args: { _sandbox_user_id: string; _token: string }
        Returns: Json
      }
      next_document_sequence: {
        Args: { _doc_type: string; _org_id: string }
        Returns: string
      }
      org_has_transactions: { Args: { _org_id: string }; Returns: boolean }
      post_asset_disposal_journal: {
        Args: { _asset_id: string }
        Returns: string
      }
      post_bill_journal: { Args: { _bill_id: string }; Returns: string }
      post_bill_payment_journal: { Args: { _bill_id: string }; Returns: string }
      post_expense_journal: { Args: { _expense_id: string }; Returns: string }
      post_invoice_journal: { Args: { _invoice_id: string }; Returns: string }
      post_invoice_payment_journal: {
        Args: { _invoice_id: string }
        Returns: string
      }
      post_journal_entry: {
        Args: {
          p_date: string
          p_doc_id: string
          p_doc_type: string
          p_lines: Json
          p_memo: string
          p_org_id: string
        }
        Returns: string
      }
      post_journal_with_override: {
        Args: {
          p_date: string
          p_doc_id: string
          p_doc_type: string
          p_lines: Json
          p_memo: string
          p_org_id: string
          p_override_reason: string
        }
        Returns: string
      }
      recalculate_attendance: {
        Args: { _end_date: string; _org_id: string; _start_date: string }
        Returns: Json
      }
      recalculate_attendance_internal: {
        Args: { _end_date: string; _org_id: string; _start_date: string }
        Returns: Json
      }
      reconcile_subledgers: { Args: { _org_id: string }; Returns: Json }
      redeem_subscription_key: {
        Args: { _org_id: string; _passkey: string }
        Returns: Json
      }
      reinitiate_onboarding: { Args: { _org_id: string }; Returns: Json }
      reset_sandbox_org: { Args: { _org_id: string }; Returns: undefined }
      reverse_journal_entry: { Args: { p_eid: string }; Returns: string }
      run_depreciation_batch: {
        Args: { _org_id: string; _period_date: string }
        Returns: Json
      }
      run_financial_verification: { Args: { _org_id?: string }; Returns: Json }
      run_full_reconciliation: { Args: { _org_id: string }; Returns: Json }
      run_integrity_audit: { Args: { _org_id: string }; Returns: Json }
      run_integrity_verification: { Args: { _org_id?: string }; Returns: Json }
      run_root_cause_audit: { Args: { p_org_id?: string }; Returns: Json }
      sandbox_force_delete_journal_data: {
        Args: { _org_id: string }
        Returns: undefined
      }
      sandbox_force_reset_tables: {
        Args: { _org_id: string }
        Returns: undefined
      }
      set_org_context: { Args: { _org_id: string }; Returns: undefined }
      set_sandbox_impersonation: {
        Args: { _sandbox_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "hr" | "manager" | "employee" | "finance" | "payroll"
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
      app_role: ["admin", "hr", "manager", "employee", "finance", "payroll"],
    },
  },
} as const
