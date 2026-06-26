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
      agent_config: {
        Row: {
          agents_md: string | null
          backlog_provider: string | null
          brain_synced_at: string | null
          brain_version: string | null
          business_model: string | null
          checkpoint_time: string | null
          comm_provider: string | null
          company_id: string
          company_website: string | null
          created_at: string | null
          daily_report_time: string | null
          discord_channel_id: string | null
          discord_public_key: string | null
          discord_server_id: string | null
          github_commit_hash: string | null
          github_repo_url: string | null
          id: string
          is_active: boolean | null
          main_challenges: Json | null
          morning_briefing_time: string | null
          notion_database_id: string | null
          notion_database_ids: Json | null
          openclaw_workspace_url: string | null
          segment: string | null
          soul_md: string | null
          team_size: string | null
          timezone: string | null
          updated_at: string | null
          user_md: string | null
          vps_url: string | null
        }
        Insert: {
          agents_md?: string | null
          backlog_provider?: string | null
          brain_synced_at?: string | null
          brain_version?: string | null
          business_model?: string | null
          checkpoint_time?: string | null
          comm_provider?: string | null
          company_id: string
          company_website?: string | null
          created_at?: string | null
          daily_report_time?: string | null
          discord_channel_id?: string | null
          discord_public_key?: string | null
          discord_server_id?: string | null
          github_commit_hash?: string | null
          github_repo_url?: string | null
          id?: string
          is_active?: boolean | null
          main_challenges?: Json | null
          morning_briefing_time?: string | null
          notion_database_id?: string | null
          notion_database_ids?: Json | null
          openclaw_workspace_url?: string | null
          segment?: string | null
          soul_md?: string | null
          team_size?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_md?: string | null
          vps_url?: string | null
        }
        Update: {
          agents_md?: string | null
          backlog_provider?: string | null
          brain_synced_at?: string | null
          brain_version?: string | null
          business_model?: string | null
          checkpoint_time?: string | null
          comm_provider?: string | null
          company_id?: string
          company_website?: string | null
          created_at?: string | null
          daily_report_time?: string | null
          discord_channel_id?: string | null
          discord_public_key?: string | null
          discord_server_id?: string | null
          github_commit_hash?: string | null
          github_repo_url?: string | null
          id?: string
          is_active?: boolean | null
          main_challenges?: Json | null
          morning_briefing_time?: string | null
          notion_database_id?: string | null
          notion_database_ids?: Json | null
          openclaw_workspace_url?: string | null
          segment?: string | null
          soul_md?: string | null
          team_size?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_md?: string | null
          vps_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          company_id: string | null
          content: string | null
          created_at: string | null
          error: string | null
          finished_at: string | null
          id: string
          instance_id: string | null
          result: Json | null
          routine_id: string | null
          started_at: string | null
          status: string
          task_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          instance_id?: string | null
          result?: Json | null
          routine_id?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          instance_id?: string | null
          result?: Json | null
          routine_id?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "atlas_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys_registry: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          service_name: string
          updated_at: string | null
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          service_name: string
          updated_at?: string | null
          user_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          service_name?: string
          updated_at?: string | null
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: []
      }
      atlas_instances: {
        Row: {
          agent_type: string | null
          hooks_token: string | null
          hostname: string | null
          id: string
          ingress_url: string | null
          last_seen: string | null
          openclaw_dashboard_token: string | null
          openclaw_version: string | null
          owner_user_id: string | null
          registered_at: string | null
          system_prompt: string | null
        }
        Insert: {
          agent_type?: string | null
          hooks_token?: string | null
          hostname?: string | null
          id?: string
          ingress_url?: string | null
          last_seen?: string | null
          openclaw_dashboard_token?: string | null
          openclaw_version?: string | null
          owner_user_id?: string | null
          registered_at?: string | null
          system_prompt?: string | null
        }
        Update: {
          agent_type?: string | null
          hooks_token?: string | null
          hostname?: string | null
          id?: string
          ingress_url?: string | null
          last_seen?: string | null
          openclaw_dashboard_token?: string | null
          openclaw_version?: string | null
          owner_user_id?: string | null
          registered_at?: string | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      atlas_settings: {
        Row: {
          brain_repo_url: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          brain_repo_url?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          brain_repo_url?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      channel_messages: {
        Row: {
          channel_name: string
          company_id: string
          content: string
          created_at: string | null
          id: string
          message_type: string | null
          platform: string
          sender: string
        }
        Insert: {
          channel_name: string
          company_id: string
          content: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          platform?: string
          sender: string
        }
        Update: {
          channel_name?: string
          company_id?: string
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          platform?: string
          sender?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          mention_member_ids: string[] | null
          name: string
          platform: string
          purposes: string[]
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          mention_member_ids?: string[] | null
          name: string
          platform?: string
          purposes?: string[]
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          mention_member_ids?: string[] | null
          name?: string
          platform?: string
          purposes?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      company_context: {
        Row: {
          agent_name: string | null
          cases: Json | null
          communication_tone: string | null
          company_id: string
          created_at: string | null
          generated_by_ai: boolean | null
          id: string
          mission: string | null
          operational_context: string | null
          presentation: string | null
          products: Json | null
          reviewed_at: string | null
          skills_enabled: Json | null
          system_prompt: string | null
          target_audience: string | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          cases?: Json | null
          communication_tone?: string | null
          company_id: string
          created_at?: string | null
          generated_by_ai?: boolean | null
          id?: string
          mission?: string | null
          operational_context?: string | null
          presentation?: string | null
          products?: Json | null
          reviewed_at?: string | null
          skills_enabled?: Json | null
          system_prompt?: string | null
          target_audience?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          cases?: Json | null
          communication_tone?: string | null
          company_id?: string
          created_at?: string | null
          generated_by_ai?: boolean | null
          id?: string
          mission?: string | null
          operational_context?: string | null
          presentation?: string | null
          products?: Json | null
          reviewed_at?: string | null
          skills_enabled?: Json | null
          system_prompt?: string | null
          target_audience?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_context_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          service: string
          updated_at: string | null
          vault_key: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          service: string
          updated_at?: string | null
          vault_key: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          service?: string
          updated_at?: string | null
          vault_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "credentials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      directives: {
        Row: {
          company_id: string
          content: string
          created_at: string | null
          id: string
          origin_event: string | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string | null
          id?: string
          origin_event?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string | null
          id?: string
          origin_event?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "directives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_logs: {
        Row: {
          company_id: string
          content: string
          created_at: string | null
          id: string
          task_id: string | null
          type: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string | null
          id?: string
          task_id?: string | null
          type: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      installer_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          owner_user_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          owner_user_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          owner_user_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      knowledge_files: {
        Row: {
          active: boolean | null
          company_id: string
          file_type: string | null
          filename: string
          id: string
          kind: string | null
          source_type: string | null
          status: string | null
          storage_path: string | null
          updated_at: string | null
          uploaded_at: string | null
        }
        Insert: {
          active?: boolean | null
          company_id: string
          file_type?: string | null
          filename: string
          id?: string
          kind?: string | null
          source_type?: string | null
          status?: string | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
        }
        Update: {
          active?: boolean | null
          company_id?: string
          file_type?: string | null
          filename?: string
          id?: string
          kind?: string | null
          source_type?: string | null
          status?: string | null
          storage_path?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          company_id: string | null
          completed: boolean | null
          created_at: string | null
          current_step: number | null
          draft: Json | null
          id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          current_step?: number | null
          draft?: Json | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          current_step?: number | null
          draft?: Json | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      process_imports: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          error: string | null
          id: string
          kind: string
          progress_message: string | null
          result: Json | null
          source_name: string | null
          status: string
          storage_path: string | null
          transcript: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          error?: string | null
          id?: string
          kind: string
          progress_message?: string | null
          result?: Json | null
          source_name?: string | null
          status?: string
          storage_path?: string | null
          transcript?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          error?: string | null
          id?: string
          kind?: string
          progress_message?: string | null
          result?: Json | null
          source_name?: string | null
          status?: string
          storage_path?: string | null
          transcript?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      process_suggestions: {
        Row: {
          company_id: string
          created_at: string | null
          evidence: Json | null
          id: string
          process_id: string | null
          status: string
          suggested_process: Json | null
          suggested_step: Json
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          evidence?: Json | null
          id?: string
          process_id?: string | null
          status?: string
          suggested_process?: Json | null
          suggested_step: Json
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          evidence?: Json | null
          id?: string
          process_id?: string | null
          status?: string
          suggested_process?: Json | null
          suggested_step?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "process_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "process_suggestions_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "processes"
            referencedColumns: ["id"]
          },
        ]
      }
      processes: {
        Row: {
          area: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          import_origin: string | null
          import_transcript: string | null
          name: string
          source: string | null
          status: string
          steps: Json
          updated_at: string | null
          updated_by: string | null
          visibility: string
        }
        Insert: {
          area?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          import_origin?: string | null
          import_transcript?: string | null
          name: string
          source?: string | null
          status?: string
          steps?: Json
          updated_at?: string | null
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          area?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          import_origin?: string | null
          import_transcript?: string | null
          name?: string
          source?: string | null
          status?: string
          steps?: Json
          updated_at?: string | null
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "processes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_approved: boolean
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_approved?: boolean
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_approved?: boolean
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          company_id: string
          content: string
          created_at: string | null
          id: string
          sent_to_discord: boolean | null
          tasks_blocked: number | null
          tasks_doing: number | null
          tasks_done: number | null
          type: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string | null
          id?: string
          sent_to_discord?: boolean | null
          tasks_blocked?: number | null
          tasks_doing?: number | null
          tasks_done?: number | null
          type: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string | null
          id?: string
          sent_to_discord?: boolean | null
          tasks_blocked?: number | null
          tasks_doing?: number | null
          tasks_done?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          approved: boolean | null
          company_id: string
          created_at: string | null
          frequency: string
          id: string
          instruction: string
          last_run_at: string | null
          last_run_status: string | null
          name: string
          requested_by: string | null
          schedule_day: number | null
          schedule_time: string | null
          status: string
          target_system: string | null
          updated_at: string | null
        }
        Insert: {
          approved?: boolean | null
          company_id: string
          created_at?: string | null
          frequency: string
          id?: string
          instruction: string
          last_run_at?: string | null
          last_run_status?: string | null
          name: string
          requested_by?: string | null
          schedule_day?: number | null
          schedule_time?: string | null
          status?: string
          target_system?: string | null
          updated_at?: string | null
        }
        Update: {
          approved?: boolean | null
          company_id?: string
          created_at?: string | null
          frequency?: string
          id?: string
          instruction?: string
          last_run_at?: string | null
          last_run_status?: string | null
          name?: string
          requested_by?: string | null
          schedule_day?: number | null
          schedule_time?: string | null
          status?: string
          target_system?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          block_reason: string | null
          company_id: string
          completed_at: string | null
          created_at: string | null
          description: string | null
          error_log: string | null
          evidence_url: string | null
          id: string
          is_adhoc: boolean | null
          notion_task_id: string
          priority: string | null
          result: string | null
          source: string | null
          started_at: string | null
          status: string | null
          steps: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          block_reason?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          error_log?: string | null
          evidence_url?: string | null
          id?: string
          is_adhoc?: boolean | null
          notion_task_id: string
          priority?: string | null
          result?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
          steps?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          block_reason?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          error_log?: string | null
          evidence_url?: string | null
          id?: string
          is_adhoc?: boolean | null
          notion_task_id?: string
          priority?: string | null
          result?: string | null
          source?: string | null
          started_at?: string | null
          status?: string | null
          steps?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          channel: string
          company_id: string
          created_at: string | null
          handle: string
          id: string
          name: string
          permissions: string[]
          role: string | null
          updated_at: string | null
        }
        Insert: {
          channel?: string
          company_id: string
          created_at?: string | null
          handle: string
          id?: string
          name: string
          permissions?: string[]
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string | null
          handle?: string
          id?: string
          name?: string
          permissions?: string[]
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_auth_trigger: { Args: never; Returns: Json }
      get_handle_new_user_def: { Args: never; Returns: string }
      get_secret: { Args: { secret_name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      read_credential: {
        Args: { p_company_id: string; p_service: string }
        Returns: string
      }
      read_credential_service: {
        Args: { p_company_id: string; p_service: string }
        Returns: string
      }
      store_credential: {
        Args: { p_company_id: string; p_service: string; p_value: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "agent"
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
      app_role: ["admin", "supervisor", "agent"],
    },
  },
} as const
