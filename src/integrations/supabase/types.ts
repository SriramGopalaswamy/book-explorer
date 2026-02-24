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
      bills: {
        Row: {
          ai_extracted: boolean
          amount: number
          attachment_url: string | null
          bill_date: string
          bill_number: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          organization_id: string
          status: string
          tax_amount: number
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
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          tax_amount?: number
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
          due_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
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
          description?: string | null
          expense_date?: string
          id?: string
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
          description?: string | null
          expense_date?: string
          id?: string
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
          debit: number
          description: string | null
          id: string
          is_posted: boolean
          journal_entry_id: string | null
          memo: string | null
          organization_id: string
          posted_at: string | null
          posting_date: string | null
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
          debit?: number
          description?: string | null
          id?: string
          is_posted?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          organization_id?: string
          posted_at?: string | null
          posting_date?: string | null
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
          debit?: number
          description?: string | null
          id?: string
          is_posted?: boolean
          journal_entry_id?: string | null
          memo?: string | null
          organization_id?: string
          posted_at?: string | null
          posting_date?: string | null
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
      gl_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
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
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
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
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
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
          customer_gstin: string | null
          customer_id: string | null
          due_date: string
          id: string
          igst_total: number
          invoice_date: string
          invoice_number: string
          notes: string | null
          organization_id: string
          payment_terms: string | null
          place_of_supply: string | null
          sgst_total: number
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          cgst_total?: number
          client_email: string
          client_name: string
          created_at?: string
          customer_gstin?: string | null
          customer_id?: string | null
          due_date: string
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          place_of_supply?: string | null
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
          client_email?: string
          client_name?: string
          created_at?: string
          customer_gstin?: string | null
          customer_id?: string | null
          due_date?: string
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          place_of_supply?: string | null
          sgst_total?: number
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
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
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          document_sequence_number: string | null
          entry_date: string
          fiscal_period_id: string | null
          id: string
          is_posted: boolean
          is_reversal: boolean
          memo: string | null
          organization_id: string
          posted_at: string
          reversed_entry_id: string | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_sequence_number?: string | null
          entry_date?: string
          fiscal_period_id?: string | null
          id?: string
          is_posted?: boolean
          is_reversal?: boolean
          memo?: string | null
          organization_id: string
          posted_at?: string
          reversed_entry_id?: string | null
          source_id?: string | null
          source_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_sequence_number?: string | null
          entry_date?: string
          fiscal_period_id?: string | null
          id?: string
          is_posted?: boolean
          is_reversal?: boolean
          memo?: string | null
          organization_id?: string
          posted_at?: string
          reversed_entry_id?: string | null
          source_id?: string | null
          source_type?: string
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
          created_at: string
          credit: number
          debit: number
          description: string | null
          gl_account_id: string
          id: string
          journal_entry_id: string
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          gl_account_id: string
          id?: string
          journal_entry_id: string
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          gl_account_id?: string
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
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
          org_state: string
          sandbox_expires_at: string | null
          sandbox_owner: string | null
          settings: Json | null
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auto_reset_enabled?: boolean
          created_at?: string
          environment_type?: string
          id?: string
          name: string
          org_state?: string
          sandbox_expires_at?: string | null
          sandbox_owner?: string | null
          settings?: Json | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auto_reset_enabled?: boolean
          created_at?: string
          environment_type?: string
          id?: string
          name?: string
          org_state?: string
          sandbox_expires_at?: string | null
          sandbox_owner?: string | null
          settings?: Json | null
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          basic_salary: number
          created_at: string
          hra: number
          id: string
          net_pay: number
          notes: string | null
          organization_id: string
          other_allowances: number
          other_deductions: number
          pay_period: string
          pf_deduction: number
          processed_at: string | null
          profile_id: string | null
          status: string
          tax_deduction: number
          transport_allowance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          basic_salary?: number
          created_at?: string
          hra?: number
          id?: string
          net_pay?: number
          notes?: string | null
          organization_id?: string
          other_allowances?: number
          other_deductions?: number
          pay_period: string
          pf_deduction?: number
          processed_at?: string | null
          profile_id?: string | null
          status?: string
          tax_deduction?: number
          transport_allowance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          basic_salary?: number
          created_at?: string
          hra?: number
          id?: string
          net_pay?: number
          notes?: string | null
          organization_id?: string
          other_allowances?: number
          other_deductions?: number
          pay_period?: string
          pf_deduction?: number
          processed_at?: string | null
          profile_id?: string | null
          status?: string
          tax_deduction?: number
          transport_allowance?: number
          updated_at?: string
          user_id?: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string | null
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
    }
    Views: {
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
      clear_sandbox_impersonation: { Args: never; Returns: undefined }
      controlled_org_reinitialize: { Args: { _org_id: string }; Returns: Json }
      create_sandbox_org: {
        Args: { _auto_reset?: boolean; _name: string }
        Returns: string
      }
      delete_sandbox_org: { Args: { _org_id: string }; Returns: undefined }
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
      is_admin_hr_or_manager: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_finance: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_hr: { Args: { _user_id: string }; Returns: boolean }
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
      next_document_sequence: {
        Args: { _doc_type: string; _org_id: string }
        Returns: string
      }
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
      reset_sandbox_org: { Args: { _org_id: string }; Returns: undefined }
      reverse_journal_entry: { Args: { p_eid: string }; Returns: string }
      run_full_reconciliation: { Args: { _org_id: string }; Returns: Json }
      run_integrity_audit: { Args: { _org_id: string }; Returns: Json }
      set_org_context: { Args: { _org_id: string }; Returns: undefined }
      set_sandbox_impersonation: {
        Args: { _sandbox_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "hr" | "manager" | "employee" | "finance"
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
      app_role: ["admin", "hr", "manager", "employee", "finance"],
    },
  },
} as const
