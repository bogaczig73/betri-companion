CREATE TYPE "public"."paper_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "paper_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "science_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by_id" uuid,
	"title" text NOT NULL,
	"authors" text,
	"year" integer,
	"journal" text,
	"abstract" text,
	"file_name" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_url" text NOT NULL,
	"anthropic_file_id" text,
	"status" "paper_status" DEFAULT 'processing' NOT NULL,
	"status_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "paper_chunks" ADD CONSTRAINT "paper_chunks_paper_id_science_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."science_papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "science_papers" ADD CONSTRAINT "science_papers_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paper_chunks_paper_chunk_unique" ON "paper_chunks" USING btree ("paper_id","chunk_index");--> statement-breakpoint
CREATE UNIQUE INDEX "science_papers_sha256_unique" ON "science_papers" USING btree ("sha256");