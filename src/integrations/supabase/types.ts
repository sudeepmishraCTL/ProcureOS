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
      analyst_answers: {
        Row: {
          answer: Json
          created_at: string
          id: string
          question: string
          rfx_id: string
        }
        Insert: {
          answer: Json
          created_at?: string
          id?: string
          question: string
          rfx_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          id?: string
          question?: string
          rfx_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyst_answers_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor: string
          created_at: string
          detail: string | null
          event: string
          id: string
          rfx_id: string
        }
        Insert: {
          actor?: string
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          rfx_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          rfx_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          acknowledged_items: Json | null
          allocation: Json
          approved_at: string
          approved_by: string
          id: string
          notes: string | null
          rfx_id: string
          status: string
          strategy: string
          total_value: number
        }
        Insert: {
          acknowledged_items?: Json | null
          allocation: Json
          approved_at?: string
          approved_by?: string
          id?: string
          notes?: string | null
          rfx_id: string
          status?: string
          strategy: string
          total_value: number
        }
        Update: {
          acknowledged_items?: Json | null
          allocation?: Json
          approved_at?: string
          approved_by?: string
          id?: string
          notes?: string | null
          rfx_id?: string
          status?: string
          strategy?: string
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "awards_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
      line_items: {
        Row: {
          delivery_requirement: string | null
          description: string
          id: string
          quantity: number
          rfx_id: string
          sku: string
          sort_order: number
          specifications: string | null
          unit: string
        }
        Insert: {
          delivery_requirement?: string | null
          description: string
          id?: string
          quantity: number
          rfx_id: string
          sku: string
          sort_order?: number
          specifications?: string | null
          unit?: string
        }
        Update: {
          delivery_requirement?: string | null
          description?: string
          id?: string
          quantity?: number
          rfx_id?: string
          sku?: string
          sort_order?: number
          specifications?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_items_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_questions: {
        Row: {
          created_at: string
          guidance: string | null
          id: string
          mandatory: boolean
          question: string
          rfx_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          guidance?: string | null
          id?: string
          mandatory?: boolean
          question: string
          rfx_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          guidance?: string | null
          id?: string
          mandatory?: boolean
          question?: string
          rfx_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_questions_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_responses: {
        Row: {
          confidence: string | null
          evidence: string | null
          id: string
          pass_fail: boolean
          question: string
          response: string
          rfx_id: string
          sort_order: number
          source: string
          source_ref: string | null
          status: string
          vendor_id: string
          verification: string
          verification_note: string | null
        }
        Insert: {
          confidence?: string | null
          evidence?: string | null
          id?: string
          pass_fail: boolean
          question: string
          response: string
          rfx_id: string
          sort_order?: number
          source?: string
          source_ref?: string | null
          status?: string
          vendor_id: string
          verification?: string
          verification_note?: string | null
        }
        Update: {
          confidence?: string | null
          evidence?: string | null
          id?: string
          pass_fail?: boolean
          question?: string
          response?: string
          rfx_id?: string
          sort_order?: number
          source?: string
          source_ref?: string | null
          status?: string
          vendor_id?: string
          verification?: string
          verification_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          confidence: string
          confidence_score: number | null
          conflict_note: string | null
          created_at: string
          id: string
          issue_note: string | null
          issue_type: string | null
          line_item_id: string
          normalization_note: string | null
          normalized_currency: string | null
          normalized_unit: string | null
          normalized_value: number | null
          original_currency: string | null
          original_text: string | null
          original_unit: string | null
          original_value: number | null
          previous_source: string | null
          previous_value: number | null
          requires_review: boolean
          rfx_id: string
          source_ref: string | null
          status: string
          superseded_at: string | null
          vendor_id: string
          vendor_response_id: string | null
          version: number
        }
        Insert: {
          confidence?: string
          confidence_score?: number | null
          conflict_note?: string | null
          created_at?: string
          id?: string
          issue_note?: string | null
          issue_type?: string | null
          line_item_id: string
          normalization_note?: string | null
          normalized_currency?: string | null
          normalized_unit?: string | null
          normalized_value?: number | null
          original_currency?: string | null
          original_text?: string | null
          original_unit?: string | null
          original_value?: number | null
          previous_source?: string | null
          previous_value?: number | null
          requires_review?: boolean
          rfx_id: string
          source_ref?: string | null
          status?: string
          superseded_at?: string | null
          vendor_id: string
          vendor_response_id?: string | null
          version?: number
        }
        Update: {
          confidence?: string
          confidence_score?: number | null
          conflict_note?: string | null
          created_at?: string
          id?: string
          issue_note?: string | null
          issue_type?: string | null
          line_item_id?: string
          normalization_note?: string | null
          normalized_currency?: string | null
          normalized_unit?: string | null
          normalized_value?: number | null
          original_currency?: string | null
          original_text?: string | null
          original_unit?: string | null
          original_value?: number | null
          previous_source?: string | null
          previous_value?: number | null
          requires_review?: boolean
          rfx_id?: string
          source_ref?: string | null
          status?: string
          superseded_at?: string | null
          vendor_id?: string
          vendor_response_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_response_id_fkey"
            columns: ["vendor_response_id"]
            isOneToOne: false
            referencedRelation: "vendor_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      rfx: {
        Row: {
          category: string
          code: string
          created_at: string
          currency: string
          delivery_location: string
          description: string | null
          docs_required: boolean
          due_date: string | null
          event_type: string
          fx_rate: number
          id: string
          incoterms: string
          is_active: boolean
          lead_time: string
          min_experience: string | null
          name: string
          payment_terms: string
          quality_cert_required: boolean
          questionnaire_required: boolean
          quote_validity_days: number
          sent_at: string | null
          status: string
          tax_treatment: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          currency?: string
          delivery_location?: string
          description?: string | null
          docs_required?: boolean
          due_date?: string | null
          event_type?: string
          fx_rate?: number
          id?: string
          incoterms?: string
          is_active?: boolean
          lead_time?: string
          min_experience?: string | null
          name: string
          payment_terms?: string
          quality_cert_required?: boolean
          questionnaire_required?: boolean
          quote_validity_days?: number
          sent_at?: string | null
          status?: string
          tax_treatment?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          currency?: string
          delivery_location?: string
          description?: string | null
          docs_required?: boolean
          due_date?: string | null
          event_type?: string
          fx_rate?: number
          id?: string
          incoterms?: string
          is_active?: boolean
          lead_time?: string
          min_experience?: string | null
          name?: string
          payment_terms?: string
          quality_cert_required?: boolean
          questionnaire_required?: boolean
          quote_validity_days?: number
          sent_at?: string | null
          status?: string
          tax_treatment?: string
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          constraints: Json
          created_at: string
          created_by: string
          id: string
          name: string
          result: Json
          rfx_id: string
        }
        Insert: {
          constraints: Json
          created_at?: string
          created_by?: string
          id?: string
          name: string
          result: Json
          rfx_id: string
        }
        Update: {
          constraints?: Json
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          result?: Json
          rfx_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenarios_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
      unmatched_lines: {
        Row: {
          created_at: string
          id: string
          match_confidence: string
          original_text: string
          reason: string | null
          rfx_id: string
          stated_price: string | null
          status: string
          suggested_sku: string | null
          vendor_id: string
          vendor_response_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_confidence?: string
          original_text: string
          reason?: string | null
          rfx_id: string
          stated_price?: string | null
          status?: string
          suggested_sku?: string | null
          vendor_id: string
          vendor_response_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          match_confidence?: string
          original_text?: string
          reason?: string | null
          rfx_id?: string
          stated_price?: string | null
          status?: string
          suggested_sku?: string | null
          vendor_id?: string
          vendor_response_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unmatched_lines_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_lines_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unmatched_lines_vendor_response_id_fkey"
            columns: ["vendor_response_id"]
            isOneToOne: false
            referencedRelation: "vendor_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_responses: {
        Row: {
          extraction_confidence: number | null
          extraction_notes: string | null
          file_mime: string | null
          file_path: string | null
          id: string
          image_data: string | null
          is_demo: boolean
          processed_at: string | null
          raw_content: string
          received_at: string
          response_type: string
          rfx_id: string
          source_file: string
          source_type: string
          vendor_id: string
        }
        Insert: {
          extraction_confidence?: number | null
          extraction_notes?: string | null
          file_mime?: string | null
          file_path?: string | null
          id?: string
          image_data?: string | null
          is_demo?: boolean
          processed_at?: string | null
          raw_content: string
          received_at?: string
          response_type?: string
          rfx_id: string
          source_file: string
          source_type: string
          vendor_id: string
        }
        Update: {
          extraction_confidence?: number | null
          extraction_notes?: string | null
          file_mime?: string | null
          file_path?: string | null
          id?: string
          image_data?: string | null
          is_demo?: boolean
          processed_at?: string | null
          raw_content?: string
          received_at?: string
          response_type?: string
          rfx_id?: string
          source_file?: string
          source_type?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_responses_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_responses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          id: string
          name: string
          rfx_id: string
          short_name: string
          sort_order: number
          status: string
        }
        Insert: {
          id?: string
          name: string
          rfx_id: string
          short_name: string
          sort_order?: number
          status?: string
        }
        Update: {
          id?: string
          name?: string
          rfx_id?: string
          short_name?: string
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_rfx_id_fkey"
            columns: ["rfx_id"]
            isOneToOne: false
            referencedRelation: "rfx"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
