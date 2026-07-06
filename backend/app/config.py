from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # SQLite by default — no DB server, no docker, no login/auth issues.
    database_url: str = "sqlite:///./tracenet.db"
    jwt_secret: str = "change_this_demo_secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 120
    demo_mfa_code: str = "123456"
    github_api_base: str = "https://api.github.com"
    cors_origins: str = "http://localhost:5173"


    # ---------------- Apify connectors ----------------
    # Put your Apify API token in .env. TraceNet uses Apify only for public-source
    # discovery. It does NOT run private account-enumeration/login/OTP checks.
    apify_token: str = ""
    apify_api_base: str = "https://api.apify.com"
    enable_apify_maigret: bool = True
    enable_apify_public_search: bool = True
    enable_apify_web_scraper: bool = True
    enable_apify_username_search: bool = True
    enable_apify_ip_domain_search: bool = True
    trace_apify_only_mode: bool = True
    apify_maigret_actor_id: str = "ntriqpro/maigret-actor"
    apify_public_search_actor_id: str = "apify/google-search-scraper"
    apify_web_scraper_actor_id: str = "apify/web-scraper"
    apify_maigret_top_sites: int = 100
    apify_maigret_site_timeout: int = 8
    apify_maigret_tags: str = ""
    apify_maigret_exclude_tags: str = ""
    apify_maigret_sites: str = ""
    apify_maigret_no_recursion: bool = True
    apify_maigret_max_items: int = 40
    apify_search_max_pages: int = 1
    apify_search_max_results: int = 20
    apify_search_results_per_page: int = 10
    apify_follow_search_result_pages: bool = True
    apify_follow_search_result_limit: int = 2
    apify_web_scraper_max_pages: int = 3
    apify_web_scraper_max_items: int = 25
    enable_email_localpart_username_discovery: bool = True
    apify_search_country_code: str = "in"
    apify_search_language_code: str = "en"
    apify_actor_timeout_seconds: int = 120
    apify_http_timeout_seconds: int = 150
    apify_max_total_charge_usd: float = 0.50

    # ---------------- Additional Apify scraping actors ----------------
    # These expand coverage beyond Maigret + Google Search + Web Scraper.
    # Every actor here is public-source only: profile pages, public posts,
    # public email/domain intelligence. No private account enumeration.
    # Toggle any of them independently from .env.
    enable_apify_instagram: bool = True
    enable_apify_tiktok: bool = True
    enable_apify_twitter: bool = True
    enable_apify_linkedin: bool = True
    enable_apify_email_verify: bool = True
    enable_apify_domain_whois: bool = True
    enable_apify_reddit: bool = True

    apify_instagram_actor_id: str = "apify/instagram-profile-scraper"
    apify_tiktok_actor_id: str = "clockworks/tiktok-profile-scraper"
    apify_twitter_actor_id: str = "apidojo/twitter-user-scraper"
    apify_linkedin_actor_id: str = "apimaestro/linkedin-profile-detail"
    apify_email_verify_actor_id: str = "apify/contact-info-scraper"
    apify_domain_whois_actor_id: str = "epctex/whois-scraper"
    apify_reddit_actor_id: str = "trudax/reddit-user-scraper"

    apify_profile_scraper_max_items: int = 15
    apify_profile_scraper_max_posts: int = 12

    # ---------------- OSINT connectors ----------------
    # Keyless / free connectors are ON by default. Paid/provider-backed public
    # OSINT connectors run only when a key/flag is supplied. No demo profile
    # dataset is used by the analysis pipeline.
    enable_gravatar: bool = True              # email -> public avatar (keyless)
    enable_live_username_check: bool = False  # public profile-URL existence (opt-in, lawful use)

    # Optional MOSINT email OSINT connector. OFF by default. Enable only for
    # owned emails, consent-based tests, or legally authorized investigations.
    enable_mosint: bool = False
    mosint_binary: str = "mosint"
    mosint_config_path: str = ".mosint.yaml"
    mosint_timeout_seconds: int = 90
    mosint_store_results: bool = True

    # Commercial / real-person providers — supply a key to activate.
    # Leave blank to keep them disabled (recommended for demo).
    behind_the_email_api_key: str = ""
    checkleaked_api_key: str = ""
    igdetective_api_key: str = ""
    facecheck_api_key: str = ""
    osint_industries_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
