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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
        ]
      }
      attendance_correction_requests: {
        Row: {
          created_at: string
          date: string
          id: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
          receipt_url: string | null
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
          organization_id?: string | null
          receipt_url?: string | null
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
          organization_id?: string | null
          receipt_url?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
        ]
      }
      goal_plans: {
        Row: {
          created_at: string
          id: string
          items: Json
          month: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          owner?: string | null
          progress?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          organization_id: string | null
          year: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          name: string
          organization_id?: string | null
          year?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          name?: string
          organization_id?: string | null
          year?: number
        }
        Relationships: [
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          invoice_number: string
          notes: string | null
          organization_id: string | null
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
          invoice_number: string
          notes?: string | null
          organization_id?: string | null
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
          invoice_number?: string
          notes?: string | null
          organization_id?: string | null
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
      leave_balances: {
        Row: {
          created_at: string
          id: string
          leave_type: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          profile_id?: string | null
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id?: string
          year?: number
        }
        Relationships: [
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
          created_at: string
          days: number
          from_date: string
          id: string
          leave_type: string
          organization_id: string | null
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
          created_at?: string
          days?: number
          from_date: string
          id?: string
          leave_type: string
          organization_id?: string | null
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
          created_at?: string
          days?: number
          from_date?: string
          id?: string
          leave_type?: string
          organization_id?: string | null
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
      memos: {
        Row: {
          attachment_url: string | null
          author_name: string
          content: string | null
          created_at: string
          department: string
          excerpt: string | null
          id: string
          organization_id: string | null
          priority: string
          published_at: string | null
          recipients: string[] | null
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
          organization_id?: string | null
          priority?: string
          published_at?: string | null
          recipients?: string[] | null
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
          organization_id?: string | null
          priority?: string
          published_at?: string | null
          recipients?: string[] | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
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
          organization_id: string
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
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json | null
          slug?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          profile_id?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
        }
        Relationships: [
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
      scheduled_payments: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          due_date: string
          id: string
          name: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          payment_type?: string
          recurrence_interval?: string | null
          recurring?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          payment_terms?: string | null
          phone?: string | null
          status?: string
          tax_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
      get_current_user_profile_id: { Args: never; Returns: string }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_hr_or_manager: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_finance: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_hr: { Args: { _user_id: string }; Returns: boolean }
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
