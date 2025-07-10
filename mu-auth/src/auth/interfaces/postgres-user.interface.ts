export interface PostgresUser {
    id: string;
    username: string;
    email: string;
    email_verified: boolean;
    first_name?: string;
    last_name?: string;
    enabled: boolean;
    created_timestamp: Date;
    updated_timestamp: Date;
    department?: string;
    clearance_level: number;
    contract_expiry_date?: Date;
    manager_id?: string;
    job_title?: string;
    business_unit?: string;
    territorial_jurisdiction?: string;
    technical_expertise?: string[];
    hierarchy_level: number;
    work_location?: string;
    employment_type: string;
    verification_status: string;
    risk_score: number;
    certifications?: string[];
    phone_number?: string;
    nationality?: string;
    date_of_birth?: Date;
    gender?: string;
    state: string;
    last_login?: Date;
    failed_login_attempts: number;
    locked_until?: Date;
  }
  
  export interface PostgresUserWithRoles extends PostgresUser {
    roles: string[];
    organization_ids: string[];
    custom_attributes: Record<string, any>;
  }