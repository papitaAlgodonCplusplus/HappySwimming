--
-- PostgreSQL database dump
--

-- Dumped from database version 17.2
-- Dumped by pg_dump version 17.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: happyswimming; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA happyswimming;


ALTER SCHEMA happyswimming OWNER TO postgres;

--
-- Name: update_modified_column(); Type: FUNCTION; Schema: happyswimming; Owner: postgres
--

CREATE FUNCTION happyswimming.update_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION happyswimming.update_modified_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.attendance (
    id integer NOT NULL,
    enrollment_id integer NOT NULL,
    session_id integer NOT NULL,
    status character varying(1000) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT attendance_status_check CHECK (((status)::text = ANY (ARRAY[('present'::character varying)::text, ('absent'::character varying)::text, ('excused'::character varying)::text, ('late'::character varying)::text])))
);


ALTER TABLE happyswimming.attendance OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.attendance_id_seq OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.attendance_id_seq OWNED BY happyswimming.attendance.id;


--
-- Name: client_services; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.client_services (
    id integer NOT NULL,
    client_id integer NOT NULL,
    service_id integer NOT NULL,
    facility_id integer,
    professional_id integer,
    start_date date NOT NULL,
    end_date date,
    recurring_pattern character varying(1000),
    day_of_week character varying(1000),
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    max_participants integer,
    price numeric(10,2) NOT NULL,
    status character varying(1000) DEFAULT 'active'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT client_services_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('active'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE happyswimming.client_services OWNER TO postgres;

--
-- Name: client_services_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.client_services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.client_services_id_seq OWNER TO postgres;

--
-- Name: client_services_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.client_services_id_seq OWNED BY happyswimming.client_services.id;


--
-- Name: clients; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.clients (
    id integer NOT NULL,
    user_id integer NOT NULL,
    company_name character varying(1000),
    identification_number character varying(1000) NOT NULL,
    address character varying(1000) NOT NULL,
    postal_code character varying(1000) NOT NULL,
    city character varying(1000) NOT NULL,
    country character varying(1000) NOT NULL,
    phone_fixed character varying(1000),
    phone_mobile character varying(1000) NOT NULL,
    website character varying(1000),
    pl_code character varying(1000),
    is_outsourcing boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.clients OWNER TO postgres;

--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.clients_id_seq OWNER TO postgres;

--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.clients_id_seq OWNED BY happyswimming.clients.id;


--
-- Name: enrollments; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.enrollments (
    id integer NOT NULL,
    participant_id integer NOT NULL,
    client_service_id integer NOT NULL,
    status character varying(1000) DEFAULT 'active'::character varying,
    enrollment_date date DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT enrollments_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('active'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE happyswimming.enrollments OWNER TO postgres;

--
-- Name: enrollments_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.enrollments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.enrollments_id_seq OWNER TO postgres;

--
-- Name: enrollments_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.enrollments_id_seq OWNED BY happyswimming.enrollments.id;


--
-- Name: facilities; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.facilities (
    id integer NOT NULL,
    name character varying(1000) NOT NULL,
    description text,
    address character varying(1000) NOT NULL,
    postal_code character varying(1000) NOT NULL,
    city character varying(1000) NOT NULL,
    country character varying(1000) NOT NULL,
    contact_phone character varying(1000),
    contact_email character varying(1000),
    client_id integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.facilities OWNER TO postgres;

--
-- Name: facilities_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.facilities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.facilities_id_seq OWNER TO postgres;

--
-- Name: facilities_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.facilities_id_seq OWNED BY happyswimming.facilities.id;


--
-- Name: participants; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.participants (
    id integer NOT NULL,
    client_id integer NOT NULL,
    first_name character varying(1000) NOT NULL,
    last_name1 character varying(1000) NOT NULL,
    last_name2 character varying(1000),
    date_of_birth date,
    gender character varying(1000),
    emergency_contact character varying(1000),
    emergency_phone character varying(1000),
    medical_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.participants OWNER TO postgres;

--
-- Name: participants_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.participants_id_seq OWNER TO postgres;

--
-- Name: participants_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.participants_id_seq OWNED BY happyswimming.participants.id;


--
-- Name: pl_codes; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.pl_codes (
    id integer NOT NULL,
    code character varying(1000) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.pl_codes OWNER TO postgres;

--
-- Name: pl_codes_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.pl_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.pl_codes_id_seq OWNER TO postgres;

--
-- Name: pl_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.pl_codes_id_seq OWNED BY happyswimming.pl_codes.id;


--
-- Name: professional_availability; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.professional_availability (
    id integer NOT NULL,
    professional_id integer NOT NULL,
    day_of_week character varying(1000) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT professional_availability_day_of_week_check CHECK (((day_of_week)::text = ANY (ARRAY[('Monday'::character varying)::text, ('Tuesday'::character varying)::text, ('Wednesday'::character varying)::text, ('Thursday'::character varying)::text, ('Friday'::character varying)::text, ('Saturday'::character varying)::text, ('Sunday'::character varying)::text])))
);


ALTER TABLE happyswimming.professional_availability OWNER TO postgres;

--
-- Name: professional_availability_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.professional_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.professional_availability_id_seq OWNER TO postgres;

--
-- Name: professional_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.professional_availability_id_seq OWNED BY happyswimming.professional_availability.id;


--
-- Name: professional_services; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.professional_services (
    professional_id integer NOT NULL,
    service_id integer NOT NULL,
    price_per_hour numeric(10,2),
    notes text
);


ALTER TABLE happyswimming.professional_services OWNER TO postgres;

--
-- Name: professional_specialties; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.professional_specialties (
    professional_id integer NOT NULL,
    specialty_id integer NOT NULL
);


ALTER TABLE happyswimming.professional_specialties OWNER TO postgres;

--
-- Name: professionals; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.professionals (
    id integer NOT NULL,
    user_id integer NOT NULL,
    company_name character varying(1000),
    identification_number character varying(1000) NOT NULL,
    address character varying(1000) NOT NULL,
    postal_code character varying(1000) NOT NULL,
    city character varying(1000) NOT NULL,
    country character varying(1000) NOT NULL,
    phone_fixed character varying(1000),
    phone_mobile character varying(1000) NOT NULL,
    website character varying(1000),
    is_insourcing boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.professionals OWNER TO postgres;

--
-- Name: professionals_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.professionals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.professionals_id_seq OWNER TO postgres;

--
-- Name: professionals_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.professionals_id_seq OWNED BY happyswimming.professionals.id;


--
-- Name: service_types; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.service_types (
    id integer NOT NULL,
    name character varying(1000) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.service_types OWNER TO postgres;

--
-- Name: service_types_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.service_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.service_types_id_seq OWNER TO postgres;

--
-- Name: service_types_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.service_types_id_seq OWNED BY happyswimming.service_types.id;


--
-- Name: services; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.services (
    id integer NOT NULL,
    name character varying(1000) NOT NULL,
    description text,
    type_id integer NOT NULL,
    duration_minutes integer NOT NULL,
    max_participants integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    price numeric(10,2)
);


ALTER TABLE happyswimming.services OWNER TO postgres;

--
-- Name: services_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.services_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.services_id_seq OWNER TO postgres;

--
-- Name: services_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.services_id_seq OWNED BY happyswimming.services.id;


--
-- Name: sessions; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.sessions (
    id integer NOT NULL,
    client_service_id integer NOT NULL,
    session_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    professional_id integer,
    facility_id integer,
    status character varying(1000) DEFAULT 'scheduled'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sessions_status_check CHECK (((status)::text = ANY (ARRAY[('scheduled'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE happyswimming.sessions OWNER TO postgres;

--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.sessions_id_seq OWNER TO postgres;

--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.sessions_id_seq OWNED BY happyswimming.sessions.id;


--
-- Name: specialties; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.specialties (
    id integer NOT NULL,
    name character varying(1000) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE happyswimming.specialties OWNER TO postgres;

--
-- Name: specialties_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.specialties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.specialties_id_seq OWNER TO postgres;

--
-- Name: specialties_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.specialties_id_seq OWNED BY happyswimming.specialties.id;


--
-- Name: users; Type: TABLE; Schema: happyswimming; Owner: postgres
--

CREATE TABLE happyswimming.users (
    id integer NOT NULL,
    email character varying(1000) NOT NULL,
    password_hash character varying(1000) NOT NULL,
    first_name character varying(1000) NOT NULL,
    last_name1 character varying(1000) NOT NULL,
    last_name2 character varying(1000),
    role character varying(1000) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('admin'::character varying)::text, ('client'::character varying)::text, ('professional'::character varying)::text])))
);


ALTER TABLE happyswimming.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: happyswimming; Owner: postgres
--

CREATE SEQUENCE happyswimming.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE happyswimming.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: happyswimming; Owner: postgres
--

ALTER SEQUENCE happyswimming.users_id_seq OWNED BY happyswimming.users.id;


--
-- Name: attendance id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.attendance ALTER COLUMN id SET DEFAULT nextval('happyswimming.attendance_id_seq'::regclass);


--
-- Name: client_services id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.client_services ALTER COLUMN id SET DEFAULT nextval('happyswimming.client_services_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.clients ALTER COLUMN id SET DEFAULT nextval('happyswimming.clients_id_seq'::regclass);


--
-- Name: enrollments id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.enrollments ALTER COLUMN id SET DEFAULT nextval('happyswimming.enrollments_id_seq'::regclass);


--
-- Name: facilities id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.facilities ALTER COLUMN id SET DEFAULT nextval('happyswimming.facilities_id_seq'::regclass);


--
-- Name: participants id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.participants ALTER COLUMN id SET DEFAULT nextval('happyswimming.participants_id_seq'::regclass);


--
-- Name: pl_codes id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.pl_codes ALTER COLUMN id SET DEFAULT nextval('happyswimming.pl_codes_id_seq'::regclass);


--
-- Name: professional_availability id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_availability ALTER COLUMN id SET DEFAULT nextval('happyswimming.professional_availability_id_seq'::regclass);


--
-- Name: professionals id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professionals ALTER COLUMN id SET DEFAULT nextval('happyswimming.professionals_id_seq'::regclass);


--
-- Name: service_types id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.service_types ALTER COLUMN id SET DEFAULT nextval('happyswimming.service_types_id_seq'::regclass);


--
-- Name: services id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.services ALTER COLUMN id SET DEFAULT nextval('happyswimming.services_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.sessions ALTER COLUMN id SET DEFAULT nextval('happyswimming.sessions_id_seq'::regclass);


--
-- Name: specialties id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.specialties ALTER COLUMN id SET DEFAULT nextval('happyswimming.specialties_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.users ALTER COLUMN id SET DEFAULT nextval('happyswimming.users_id_seq'::regclass);


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.attendance (id, enrollment_id, session_id, status, notes, created_at) FROM stdin;
\.


--
-- Data for Name: client_services; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.client_services (id, client_id, service_id, facility_id, professional_id, start_date, end_date, recurring_pattern, day_of_week, start_time, end_time, max_participants, price, status, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.clients (id, user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, pl_code, is_outsourcing, created_at, updated_at) FROM stdin;
1	1	company name	1234	100m oeste del templo carbonal	23040	Grecia	Costa Rica	88225884	(123) 456-7890	http://my-home-page.com	PL003	f	2025-03-05 09:56:56.063184	2025-03-05 09:56:56.063184
\.


--
-- Data for Name: enrollments; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.enrollments (id, participant_id, client_service_id, status, enrollment_date, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: facilities; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.facilities (id, name, description, address, postal_code, city, country, contact_phone, contact_email, client_id, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: participants; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.participants (id, client_id, first_name, last_name1, last_name2, date_of_birth, gender, emergency_contact, emergency_phone, medical_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: pl_codes; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.pl_codes (id, code, description, is_active, created_at) FROM stdin;
1	PL001	Madrid Region	t	2025-03-04 18:49:42.915808
2	PL002	Barcelona Region	t	2025-03-04 18:49:42.915808
3	PL003	Valencia Region	t	2025-03-04 18:49:42.915808
4	PL004	Seville Region	t	2025-03-04 18:49:42.915808
5	PL005	Bilbao Region	t	2025-03-04 18:49:42.915808
\.


--
-- Data for Name: professional_availability; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.professional_availability (id, professional_id, day_of_week, start_time, end_time, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: professional_services; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.professional_services (professional_id, service_id, price_per_hour, notes) FROM stdin;
1	1	200.00	Preferred time: afternoon
\.


--
-- Data for Name: professional_specialties; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.professional_specialties (professional_id, specialty_id) FROM stdin;
\.


--
-- Data for Name: professionals; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.professionals (id, user_id, company_name, identification_number, address, postal_code, city, country, phone_fixed, phone_mobile, website, is_insourcing, created_at, updated_at) FROM stdin;
1	2	\N	1235	100m oeste del templo carbonal	23040	Grecia	Costa Rica	88225884	(123) 456-7890	http://my-home-page.com	t	2025-03-05 11:09:03.780274	2025-03-05 11:09:03.780274
\.


--
-- Data for Name: service_types; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.service_types (id, name, description, created_at) FROM stdin;
1	Swimming Lessons	Regular swimming lessons for various skill levels	2025-03-04 18:49:42.915808
2	Water Therapy	Therapeutic water exercises for rehabilitation	2025-03-04 18:49:42.915808
3	Competitive Training	Training for competitive swimmers	2025-03-04 18:49:42.915808
4	Aqua Fitness	Water-based fitness and exercise classes	2025-03-04 18:49:42.915808
5	Special Needs	Specialized swimming instruction for individuals with special needs	2025-03-04 18:49:42.915808
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.services (id, name, description, type_id, duration_minutes, max_participants, is_active, created_at, updated_at, price) FROM stdin;
1	"Swimming a story" Course for Teacher Trainer/Technical Director	Includes pedagogical material. Available online (10 hours, €200) or in-person (10 hours, €2,000 for minimum 10 people)	2	600	20	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	200.00
2	"Swimming a story" Teacher course	Available online (8 hours, €90) or in-person (10 hours, €1,500 for minimum 10 people)	2	480	20	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	90.00
3	Front-crawl spinning methodology teacher course	In-person only (4 hours, €850 for minimum 10 people)	2	240	15	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	850.00
4	Aquagym instructor course	Online only (4 hours, €45)	2	240	\N	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	45.00
5	Children aged 3 to 6	Swimming lessons for children aged 3 to 6	1	300	10	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	75.00
6	Children aged 6 to 12	Swimming lessons for children aged 6 to 12	1	300	12	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	75.00
7	Any Age and Ability	Swimming lessons for people of all ages and ability levels	1	300	8	t	2025-03-05 11:35:07.746578	2025-03-05 11:35:07.746578	75.00
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.sessions (id, client_service_id, session_date, start_time, end_time, professional_id, facility_id, status, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: specialties; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.specialties (id, name, description, created_at) FROM stdin;
1	Children's Swimming	Teaching swimming to children ages 3-12	2025-03-04 18:49:42.915808
2	Advanced Technique	Advanced swimming technique coaching	2025-03-04 18:49:42.915808
3	Special Needs	Working with individuals with special needs	2025-03-04 18:49:42.915808
4	Adult Beginner	Teaching adults who are new to swimming	2025-03-04 18:49:42.915808
5	Water Therapy	Therapeutic water exercises	2025-03-04 18:49:42.915808
6	Competition Coaching	Coaching competitive swimmers	2025-03-04 18:49:42.915808
7	Infant Swimming	Teaching swimming to infants and toddlers	2025-03-04 18:49:42.915808
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: happyswimming; Owner: postgres
--

COPY happyswimming.users (id, email, password_hash, first_name, last_name1, last_name2, role, is_active, created_at, updated_at) FROM stdin;
1	alexubi001@gmail.com	$2a$10$97IAD6MhVFHjOaGCH4Fa0uDbmkxZqs.d9xj9j1QTcT6xsLIu3LvLW	my first name	Alexander	my last name	client	t	2025-03-05 09:56:56.063184	2025-03-05 09:56:56.063184
2	alexquesada22@gmail.com	$2a$10$abGrdfiBhCaQBFCdIi8Y5Oi6tdwbMpiWwE2XhdXu9n8bPpLOviQ0C	my first name	Alexander	my last name	professional	t	2025-03-05 11:09:03.780274	2025-03-05 11:09:03.780274
\.


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.attendance_id_seq', 1, false);


--
-- Name: client_services_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.client_services_id_seq', 1, false);


--
-- Name: clients_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.clients_id_seq', 1, true);


--
-- Name: enrollments_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.enrollments_id_seq', 1, false);


--
-- Name: facilities_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.facilities_id_seq', 1, false);


--
-- Name: participants_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.participants_id_seq', 1, false);


--
-- Name: pl_codes_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.pl_codes_id_seq', 1, false);


--
-- Name: professional_availability_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.professional_availability_id_seq', 1, false);


--
-- Name: professionals_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.professionals_id_seq', 1, true);


--
-- Name: service_types_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.service_types_id_seq', 1, false);


--
-- Name: services_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.services_id_seq', 1, false);


--
-- Name: sessions_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.sessions_id_seq', 1, false);


--
-- Name: specialties_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.specialties_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: happyswimming; Owner: postgres
--

SELECT pg_catalog.setval('happyswimming.users_id_seq', 2, true);


--
-- Name: attendance attendance_enrollment_id_session_id_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.attendance
    ADD CONSTRAINT attendance_enrollment_id_session_id_key UNIQUE (enrollment_id, session_id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: client_services client_services_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.client_services
    ADD CONSTRAINT client_services_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_user_id_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.clients
    ADD CONSTRAINT clients_user_id_key UNIQUE (user_id);


--
-- Name: enrollments enrollments_participant_id_client_service_id_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.enrollments
    ADD CONSTRAINT enrollments_participant_id_client_service_id_key UNIQUE (participant_id, client_service_id);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: facilities facilities_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.facilities
    ADD CONSTRAINT facilities_pkey PRIMARY KEY (id);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);


--
-- Name: pl_codes pl_codes_code_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.pl_codes
    ADD CONSTRAINT pl_codes_code_key UNIQUE (code);


--
-- Name: pl_codes pl_codes_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.pl_codes
    ADD CONSTRAINT pl_codes_pkey PRIMARY KEY (id);


--
-- Name: professional_availability professional_availability_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_availability
    ADD CONSTRAINT professional_availability_pkey PRIMARY KEY (id);


--
-- Name: professional_availability professional_availability_professional_id_day_of_week_start_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_availability
    ADD CONSTRAINT professional_availability_professional_id_day_of_week_start_key UNIQUE (professional_id, day_of_week, start_time, end_time);


--
-- Name: professional_services professional_services_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_services
    ADD CONSTRAINT professional_services_pkey PRIMARY KEY (professional_id, service_id);


--
-- Name: professional_specialties professional_specialties_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_specialties
    ADD CONSTRAINT professional_specialties_pkey PRIMARY KEY (professional_id, specialty_id);


--
-- Name: professionals professionals_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professionals
    ADD CONSTRAINT professionals_pkey PRIMARY KEY (id);


--
-- Name: professionals professionals_user_id_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professionals
    ADD CONSTRAINT professionals_user_id_key UNIQUE (user_id);


--
-- Name: service_types service_types_name_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.service_types
    ADD CONSTRAINT service_types_name_key UNIQUE (name);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: specialties specialties_name_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.specialties
    ADD CONSTRAINT specialties_name_key UNIQUE (name);


--
-- Name: specialties specialties_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.specialties
    ADD CONSTRAINT specialties_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: client_services update_client_services_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_client_services_modtime BEFORE UPDATE ON happyswimming.client_services FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: clients update_clients_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_clients_modtime BEFORE UPDATE ON happyswimming.clients FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: enrollments update_enrollments_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_enrollments_modtime BEFORE UPDATE ON happyswimming.enrollments FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: facilities update_facilities_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_facilities_modtime BEFORE UPDATE ON happyswimming.facilities FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: participants update_participants_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_participants_modtime BEFORE UPDATE ON happyswimming.participants FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: professional_availability update_professional_availability_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_professional_availability_modtime BEFORE UPDATE ON happyswimming.professional_availability FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: professionals update_professionals_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_professionals_modtime BEFORE UPDATE ON happyswimming.professionals FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: services update_services_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_services_modtime BEFORE UPDATE ON happyswimming.services FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: sessions update_sessions_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_sessions_modtime BEFORE UPDATE ON happyswimming.sessions FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: users update_users_modtime; Type: TRIGGER; Schema: happyswimming; Owner: postgres
--

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON happyswimming.users FOR EACH ROW EXECUTE FUNCTION happyswimming.update_modified_column();


--
-- Name: attendance attendance_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.attendance
    ADD CONSTRAINT attendance_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES happyswimming.enrollments(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.attendance
    ADD CONSTRAINT attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES happyswimming.sessions(id) ON DELETE CASCADE;


--
-- Name: client_services client_services_client_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.client_services
    ADD CONSTRAINT client_services_client_id_fkey FOREIGN KEY (client_id) REFERENCES happyswimming.clients(id) ON DELETE CASCADE;


--
-- Name: client_services client_services_facility_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.client_services
    ADD CONSTRAINT client_services_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES happyswimming.facilities(id);


--
-- Name: client_services client_services_professional_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.client_services
    ADD CONSTRAINT client_services_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES happyswimming.professionals(id);


--
-- Name: client_services client_services_service_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.client_services
    ADD CONSTRAINT client_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES happyswimming.services(id) ON DELETE CASCADE;


--
-- Name: clients clients_user_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.clients
    ADD CONSTRAINT clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES happyswimming.users(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_client_service_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.enrollments
    ADD CONSTRAINT enrollments_client_service_id_fkey FOREIGN KEY (client_service_id) REFERENCES happyswimming.client_services(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_participant_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.enrollments
    ADD CONSTRAINT enrollments_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES happyswimming.participants(id) ON DELETE CASCADE;


--
-- Name: facilities facilities_client_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.facilities
    ADD CONSTRAINT facilities_client_id_fkey FOREIGN KEY (client_id) REFERENCES happyswimming.clients(id);


--
-- Name: participants participants_client_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.participants
    ADD CONSTRAINT participants_client_id_fkey FOREIGN KEY (client_id) REFERENCES happyswimming.clients(id) ON DELETE CASCADE;


--
-- Name: professional_availability professional_availability_professional_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_availability
    ADD CONSTRAINT professional_availability_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES happyswimming.professionals(id) ON DELETE CASCADE;


--
-- Name: professional_services professional_services_professional_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_services
    ADD CONSTRAINT professional_services_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES happyswimming.professionals(id) ON DELETE CASCADE;


--
-- Name: professional_services professional_services_service_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_services
    ADD CONSTRAINT professional_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES happyswimming.services(id) ON DELETE CASCADE;


--
-- Name: professional_specialties professional_specialties_professional_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_specialties
    ADD CONSTRAINT professional_specialties_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES happyswimming.professionals(id) ON DELETE CASCADE;


--
-- Name: professional_specialties professional_specialties_specialty_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professional_specialties
    ADD CONSTRAINT professional_specialties_specialty_id_fkey FOREIGN KEY (specialty_id) REFERENCES happyswimming.specialties(id) ON DELETE CASCADE;


--
-- Name: professionals professionals_user_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.professionals
    ADD CONSTRAINT professionals_user_id_fkey FOREIGN KEY (user_id) REFERENCES happyswimming.users(id) ON DELETE CASCADE;


--
-- Name: services services_type_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.services
    ADD CONSTRAINT services_type_id_fkey FOREIGN KEY (type_id) REFERENCES happyswimming.service_types(id);


--
-- Name: sessions sessions_client_service_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.sessions
    ADD CONSTRAINT sessions_client_service_id_fkey FOREIGN KEY (client_service_id) REFERENCES happyswimming.client_services(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_facility_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.sessions
    ADD CONSTRAINT sessions_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES happyswimming.facilities(id);


--
-- Name: sessions sessions_professional_id_fkey; Type: FK CONSTRAINT; Schema: happyswimming; Owner: postgres
--

ALTER TABLE ONLY happyswimming.sessions
    ADD CONSTRAINT sessions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES happyswimming.professionals(id);


--
-- PostgreSQL database dump complete
--

