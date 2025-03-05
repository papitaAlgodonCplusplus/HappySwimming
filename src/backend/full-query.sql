-- Create schema for the application
CREATE SCHEMA IF NOT EXISTS happyswimming;

-- Set the search path to our schema
SET search_path TO happyswimming;

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name1 VARCHAR(100) NOT NULL,
    last_name2 VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'client', 'professional')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create clients table
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    identification_number VARCHAR(50) NOT NULL,
    address VARCHAR(255) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    phone_fixed VARCHAR(50),
    phone_mobile VARCHAR(50) NOT NULL,
    website VARCHAR(255),
    pl_code VARCHAR(50),
    is_outsourcing BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create professionals table
CREATE TABLE professionals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    identification_number VARCHAR(50) NOT NULL,
    address VARCHAR(255) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    phone_fixed VARCHAR(50),
    phone_mobile VARCHAR(50) NOT NULL,
    website VARCHAR(255),
    is_insourcing BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create professional_specialties table for many-to-many relationship
CREATE TABLE specialties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Junction table for professionals and specialties
CREATE TABLE professional_specialties (
    professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    specialty_id INTEGER NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
    PRIMARY KEY (professional_id, specialty_id)
);

-- Create table for facilities
CREATE TABLE facilities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address VARCHAR(255) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(50),
    contact_email VARCHAR(255),
    client_id INTEGER REFERENCES clients(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create table for service types
CREATE TABLE service_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create table for services
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type_id INTEGER NOT NULL REFERENCES service_types(id),
    duration_minutes INTEGER NOT NULL,
    max_participants INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create services offered by professionals
CREATE TABLE professional_services (
    professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    price_per_hour DECIMAL(10, 2),
    notes TEXT,
    PRIMARY KEY (professional_id, service_id)
);

-- Create client service contracts
CREATE TABLE client_services (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    facility_id INTEGER REFERENCES facilities(id),
    professional_id INTEGER REFERENCES professionals(id),
    start_date DATE NOT NULL,
    end_date DATE,
    recurring_pattern VARCHAR(50), -- e.g., 'weekly', 'biweekly', etc.
    day_of_week VARCHAR(20), -- e.g., 'Monday', 'Tuesday', etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_participants INTEGER,
    price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create scheduled sessions for client services
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    client_service_id INTEGER NOT NULL REFERENCES client_services(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    professional_id INTEGER REFERENCES professionals(id),
    facility_id INTEGER REFERENCES facilities(id),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create participants table
CREATE TABLE participants (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name1 VARCHAR(100) NOT NULL,
    last_name2 VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(10),
    emergency_contact VARCHAR(255),
    emergency_phone VARCHAR(50),
    medical_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create enrollments table to track participants in sessions
CREATE TABLE enrollments (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    client_service_id INTEGER NOT NULL REFERENCES client_services(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
    enrollment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (participant_id, client_service_id)
);

-- Create attendance table to track participant attendance
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (enrollment_id, session_id)
);

-- Create table for professional availability
CREATE TABLE professional_availability (
    id SERIAL PRIMARY KEY,
    professional_id INTEGER NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (professional_id, day_of_week, start_time, end_time)
);

-- Create PL (Professional Liaison) codes table
CREATE TABLE pl_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sample data for service types
INSERT INTO service_types (name, description) VALUES
('Swimming Lessons', 'Regular swimming lessons for various skill levels'),
('Water Therapy', 'Therapeutic water exercises for rehabilitation'),
('Competitive Training', 'Training for competitive swimmers'),
('Aqua Fitness', 'Water-based fitness and exercise classes'),
('Special Needs', 'Specialized swimming instruction for individuals with special needs');

-- Insert sample PL codes
INSERT INTO pl_codes (code, description) VALUES
('PL001', 'Madrid Region'),
('PL002', 'Barcelona Region'),
('PL003', 'Valencia Region'),
('PL004', 'Seville Region'),
('PL005', 'Bilbao Region');

-- Insert sample specialties
INSERT INTO specialties (name, description) VALUES
('Children''s Swimming', 'Teaching swimming to children ages 3-12'),
('Advanced Technique', 'Advanced swimming technique coaching'),
('Special Needs', 'Working with individuals with special needs'),
('Adult Beginner', 'Teaching adults who are new to swimming'),
('Water Therapy', 'Therapeutic water exercises'),
('Competition Coaching', 'Coaching competitive swimmers'),
('Infant Swimming', 'Teaching swimming to infants and toddlers');

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updating timestamp
CREATE TRIGGER update_users_modtime
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_clients_modtime
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_professionals_modtime
BEFORE UPDATE ON professionals
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_facilities_modtime
BEFORE UPDATE ON facilities
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_services_modtime
BEFORE UPDATE ON services
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_client_services_modtime
BEFORE UPDATE ON client_services
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_sessions_modtime
BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_participants_modtime
BEFORE UPDATE ON participants
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_enrollments_modtime
BEFORE UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_professional_availability_modtime
BEFORE UPDATE ON professional_availability
FOR EACH ROW EXECUTE FUNCTION update_modified_column();