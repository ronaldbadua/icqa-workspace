export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type HourlyNoteStatus = "resolved" | "pending" | "needs_attention";
export type ProcessStage = "pending" | "in_progress" | "done";
export type ShiftType = "FHD" | "BHD" | "Part Time" | "Vacation";
export type AssignmentRole = "main" | "pooling" | "backup";

export interface Database {
  public: {
    Tables: {
      hourly_notes: {
        Row: {
          id: string;
          note_date: string;
          hour: number;
          status: HourlyNoteStatus;
          content: string;
          author_name: string;
          manager_comment: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          note_date: string;
          hour: number;
          status?: HourlyNoteStatus;
          content?: string;
          author_name?: string;
          manager_comment?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          note_date?: string;
          hour?: number;
          status?: HourlyNoteStatus;
          content?: string;
          author_name?: string;
          manager_comment?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          body: string;
          author_name: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          body: string;
          author_name?: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          body?: string;
          author_name?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      database_entries: {
        Row: {
          id: string;
          label: string;
          notes: string;
          data: Json;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          label?: string;
          notes?: string;
          data?: Json;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          label?: string;
          notes?: string;
          data?: Json;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      schedule_events: {
        Row: {
          id: string;
          event_date: string;
          start_time: string;
          end_time: string;
          title: string;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_date: string;
          start_time: string;
          end_time: string;
          title: string;
          notes?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_date?: string;
          start_time?: string;
          end_time?: string;
          title?: string;
          notes?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      associates: {
        Row: {
          id: string;
          name: string;
          shift_type: ShiftType;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          shift_type: ShiftType;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          shift_type?: ShiftType;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      pooling_rules: {
        Row: {
          id: string;
          associate_id: string;
          allow_sunday: boolean;
          allow_monday: boolean;
          allow_tuesday: boolean;
          allow_wednesday: boolean;
          allow_thursday: boolean;
          allow_friday: boolean;
          allow_saturday: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          associate_id: string;
          allow_sunday?: boolean;
          allow_monday?: boolean;
          allow_tuesday?: boolean;
          allow_wednesday?: boolean;
          allow_thursday?: boolean;
          allow_friday?: boolean;
          allow_saturday?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          associate_id?: string;
          allow_sunday?: boolean;
          allow_monday?: boolean;
          allow_tuesday?: boolean;
          allow_wednesday?: boolean;
          allow_thursday?: boolean;
          allow_friday?: boolean;
          allow_saturday?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      monthly_assignments: {
        Row: {
          id: string;
          assignment_date: string;
          role: AssignmentRole;
          slot_type: ShiftType;
          associate_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_date: string;
          role: AssignmentRole;
          slot_type: ShiftType;
          associate_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          assignment_date?: string;
          role?: AssignmentRole;
          slot_type?: ShiftType;
          associate_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      process_path_items: {
        Row: {
          id: string;
          title: string;
          stage: ProcessStage;
          detail: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          stage?: ProcessStage;
          detail?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          stage?: ProcessStage;
          detail?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
