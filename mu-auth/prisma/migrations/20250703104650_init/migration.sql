-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('FULL_SYNC', 'INCREMENTAL_SYNC', 'USER_SYNC', 'ROLE_SYNC', 'ORGANIZATION_SYNC', 'MANUAL_SYNC');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('KEYCLOAK_TO_POSTGRES', 'POSTGRES_TO_KEYCLOAK', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "keycloak_id" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "first_name" TEXT,
    "last_name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "department" TEXT,
    "clearance_level" INTEGER NOT NULL DEFAULT 1,
    "contract_expiry_date" TIMESTAMP(3),
    "manager_id" TEXT,
    "job_title" TEXT,
    "business_unit" TEXT,
    "territorial_jurisdiction" TEXT,
    "technical_expertise" TEXT[],
    "hierarchy_level" INTEGER NOT NULL DEFAULT 1,
    "work_location" TEXT,
    "employment_type" TEXT NOT NULL DEFAULT 'PERMANENT',
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "risk_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone_number" TEXT,
    "nationality" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_timestamp" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "custom_attributes" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keycloak_id" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "keycloak_id" TEXT,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_organizations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_attributes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attribute_name" TEXT NOT NULL,
    "attribute_value" TEXT NOT NULL,

    CONSTRAINT "user_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "login_method" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "context" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "sync_type" "SyncType" NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "records_count" INTEGER NOT NULL DEFAULT 0,
    "changes" JSONB,
    "metadata" JSONB,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_mappings" (
    "id" TEXT NOT NULL,
    "keycloak_user_id" TEXT NOT NULL,
    "postgres_user_id" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keycloak_updated_at" TIMESTAMP(3) NOT NULL,
    "postgres_updated_at" TIMESTAMP(3) NOT NULL,
    "sync_hash" TEXT NOT NULL,

    CONSTRAINT "sync_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_configurations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_keycloak_id_key" ON "users"("keycloak_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_keycloak_id_idx" ON "users"("keycloak_id");

-- CreateIndex
CREATE INDEX "users_department_idx" ON "users"("department");

-- CreateIndex
CREATE INDEX "users_state_idx" ON "users"("state");

-- CreateIndex
CREATE INDEX "users_verification_status_idx" ON "users"("verification_status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_keycloak_id_key" ON "roles"("keycloak_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_keycloak_id_key" ON "organizations"("keycloak_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_organizations_user_id_organization_id_key" ON "user_organizations"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_attributes_user_id_attribute_name_key" ON "user_attributes"("user_id", "attribute_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_session_id_key" ON "user_sessions"("session_id");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_session_id_idx" ON "user_sessions"("session_id");

-- CreateIndex
CREATE INDEX "user_sessions_active_idx" ON "user_sessions"("active");

-- CreateIndex
CREATE INDEX "authorization_logs_user_id_idx" ON "authorization_logs"("user_id");

-- CreateIndex
CREATE INDEX "authorization_logs_resource_id_idx" ON "authorization_logs"("resource_id");

-- CreateIndex
CREATE INDEX "authorization_logs_timestamp_idx" ON "authorization_logs"("timestamp");

-- CreateIndex
CREATE INDEX "sync_logs_sync_type_idx" ON "sync_logs"("sync_type");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_started_at_idx" ON "sync_logs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_mappings_keycloak_user_id_key" ON "sync_mappings"("keycloak_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_mappings_postgres_user_id_key" ON "sync_mappings"("postgres_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_configurations_key_key" ON "sync_configurations"("key");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_organizations" ADD CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_attributes" ADD CONSTRAINT "user_attributes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_logs" ADD CONSTRAINT "authorization_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
