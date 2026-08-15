from supabase_client import supabase


def init_database():
    """
    Checks that Supabase can be reached when the backend starts.
    """
    try:
        supabase.table("chat_messages").select("id").limit(1).execute()
        print("Supabase database connected successfully.")
    except Exception as error:
        print("Supabase database connection failed:")
        print(error)