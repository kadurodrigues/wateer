// Types for supabase/migrations, in the shape `supabase gen types typescript` emits.
// Once the project is linked, regenerate with:
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TagColor =
  "red" | "orange" | "amber" | "green" | "teal" | "blue" | "violet" | "pink" | "slate";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      videos: {
        Row: {
          id: string;
          user_id: string;
          video_id: string;
          url: string;
          title: string | null;
          channel_name: string | null;
          duration: number | null;
          comment_count: number | null;
          watched: boolean;
          bookmarked: boolean;
          in_queue: boolean;
          position: number;
          playback_seconds: number;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id?: string;
          video_id: string;
          url: string;
          title?: string | null;
          channel_name?: string | null;
          duration?: number | null;
          comment_count?: number | null;
          watched?: boolean;
          bookmarked?: boolean;
          in_queue?: boolean;
          position: number;
          playback_seconds?: number;
          added_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["videos"]["Insert"]>;
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: TagColor;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          color: TagColor;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tags"]["Insert"]>;
        Relationships: [];
      };
      video_tags: {
        Row: { video_id: string; tag_id: string; user_id: string; created_at: string };
        Insert: { video_id: string; tag_id: string; user_id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["video_tags"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "video_tags_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      history: {
        Row: {
          user_id: string;
          video_id: string;
          url: string;
          title: string | null;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          video_id: string;
          url: string;
          title?: string | null;
          added_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["history"]["Insert"]>;
        Relationships: [];
      };
      user_settings: {
        Row: { user_id: string; auto_play_next: boolean; updated_at: string };
        Insert: { user_id?: string; auto_play_next?: boolean; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
