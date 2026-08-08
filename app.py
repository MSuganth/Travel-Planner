from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from flask_cors import CORS
import mysql.connector
from mysql.connector import pooling
import google.generativeai as genai
import uuid
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = "*************"
CORS(app)

# Initialize Gemini API
# NOTE: Using the provided API key as per the existing codebase
GEMINI_API_KEY = "xxxxxxxxxxxxxxx"
genai.configure(api_key=GEMINI_API_KEY)
# Using 'models/' prefix for broader compatibility
model = genai.GenerativeModel(model_name="models/gemini-2.5-flash")

# MySQL DB connection pool for thread safety
db_config = {
    "host": "localhost",
    "user": "root",
    "password": "xxxxx",
    "database": "Travel_details"
}

try:
    connection_pool = pooling.MySQLConnectionPool(
        pool_name="travel_pool",
        pool_size=5,
        **db_config
    )
    logger.info("Database connection pool created successfully.")
except mysql.connector.Error as err:
    logger.error(f"Error creating connection pool: {err}")
    # Fallback or exit if DB is critical
    exit(1)

def get_db_connection():
    return connection_pool.get_connection()

@app.route("/")
@app.route("/index.html")
def homepage():
    return render_template("index.html")

@app.route('/signup', methods=['GET'])
@app.route('/signup.html')
def signup_page():
    return redirect(url_for('homepage'))

@app.route('/login', methods=['GET'])
@app.route('/login.html')
def login_page():
    return redirect(url_for('homepage', msg='login_required'))

@app.route('/dashboard')
@app.route('/dashboard.html')
def dashboard():
    return render_template('dashboard.html')

# Signup endpoint
@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    logger.info(f"Signup attempt for: {data.get('email')}")
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO users (name, email, password) VALUES (%s, %s, %s)",
            (name, email, password)
        )
        db.commit()
        user_id = cursor.lastrowid
        return jsonify({"message": "Signup successful!", "name": name, "user_id": user_id}), 201
    except mysql.connector.Error as err:
        logger.error(f"Signup error: {err}")
        return jsonify({"error": str(err)}), 400
    finally:
        if cursor: cursor.close()
        if db: db.close()

# Login endpoint
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute("SELECT id, name, password FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        if user is None:
            return jsonify({"error": "Invalid Email or User does not exist"}), 401
        
        if user[2] == password:
            return jsonify({
                "message": "Login successful! Redirecting...",
                "user_id": user[0],
                "name": user[1]
            })
        else:
            return jsonify({"error": "Invalid password"}), 401
    except mysql.connector.Error as err:
        logger.error(f"Login error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        if cursor: cursor.close()
        if db: db.close()

# Logout endpoint
@app.route('/logout', methods=['POST'])
def logout():
    try:
        session.clear()
        return jsonify({"message": "Logout successful!"}), 200
    except Exception as e:
        logger.error(f"Logout Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/ask-gemini', methods=['POST'])
def chat():
    db = None
    cursor = None
    try:
        data = request.get_json()
        prompt = data.get("prompt", "")
        user_id = data.get("user_id")
        conversation_id = data.get("conversation_id")
        history_data = data.get("history", [])

        if not user_id:
            return jsonify({"error": "Missing user_id"}), 400

        if not conversation_id:
            conversation_id = str(uuid.uuid4())
            is_new_chat = True
        else:
            is_new_chat = False

        db = get_db_connection()
        cursor = db.cursor()
        
        # Save user message
        cursor.execute(
            "INSERT INTO chat_history (user_id, conversation_id, role, text, timestamp) VALUES (%s, %s, %s, %s, NOW())",
            (user_id, conversation_id, 'user', prompt)
        )
        db.commit()

        # Format history for Gemini context
        gemini_history = []
        if len(history_data) > 0:
            for msg in history_data:
                role = "user" if msg.get("role") == "user" else "model"
                gemini_history.append({"role": role, "parts": [{"text": msg.get("content")}]})

        # Get AI response
        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(prompt)
        reply = response.text

        # Save bot response
        cursor.execute(
            "INSERT INTO chat_history (user_id, conversation_id, role, text, timestamp) VALUES (%s, %s, %s, %s, NOW())",
            (user_id, conversation_id, 'bot', reply)
        )
        db.commit()

        return jsonify({
            "response": reply,
            "conversation_id": conversation_id,
            "is_new_chat": is_new_chat
        })
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if db: db.close()

# Get chat history for user
@app.route('/chat-history/<int:user_id>', methods=['GET'])
def get_chat_history(user_id):
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute(
            """
            SELECT h.conversation_id, h.role, h.text, h.timestamp, m.custom_title 
            FROM chat_history h 
            LEFT JOIN conversation_metadata m ON h.conversation_id = m.conversation_id 
            WHERE h.user_id = %s 
            ORDER BY h.timestamp ASC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        
        history = {}
        for conv_id, role, text, timestamp, custom_title in rows:
            if conv_id not in history:
                history[conv_id] = {
                    "messages": [],
                    "custom_title": custom_title
                }
            history[conv_id]["messages"].append({
                "role": role,
                "text": text,
                "timestamp": timestamp.strftime('%Y-%m-%d %H:%M:%S')
            })
        return jsonify(history)
    except mysql.connector.Error as err:
        logger.error(f"History Error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        if cursor: cursor.close()
        if db: db.close()

# Delete all chat history for a user
@app.route('/chat-history/<int:user_id>', methods=['DELETE'])
def delete_all_chat_history(user_id):
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute("DELETE FROM chat_history WHERE user_id = %s", (user_id,))
        db.commit()
        return jsonify({"message": "All chat history deleted successfully"})
    except mysql.connector.Error as err:
        logger.error(f"Delete history error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        if cursor: cursor.close()
        if db: db.close()

# Delete a specific conversation
@app.route('/chat-history/<int:user_id>/<conversation_id>', methods=['DELETE'])
def delete_conversation(user_id, conversation_id):
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute(
            "DELETE FROM chat_history WHERE user_id = %s AND conversation_id = %s",
            (user_id, conversation_id)
        )
        db.commit()
        return jsonify({"message": "Conversation deleted successfully"})
    except mysql.connector.Error as err:
        logger.error(f"Delete conversation error: {err}")
        return jsonify({"error": str(err)}), 500
    finally:
        if cursor: cursor.close()
        if db: db.close()

@app.route('/rename-conversation/<conversation_id>', methods=['PUT'])
def rename_conversation(conversation_id):
    db = None
    cursor = None
    try:
        data = request.get_json()
        new_title = data.get("title")
        if not new_title:
            return jsonify({"error": "Missing new title"}), 400
            
        db = get_db_connection()
        cursor = db.cursor()
        cursor.execute(
            "INSERT INTO conversation_metadata (conversation_id, custom_title) VALUES (%s, %s) ON DUPLICATE KEY UPDATE custom_title = %s",
            (conversation_id, new_title, new_title)
        )
        db.commit()
        return jsonify({"message": "Conversation renamed successfully"})
    except Exception as e:
        logger.error(f"Rename error: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        if cursor: cursor.close()
        if db: db.close()

if __name__ == '__main__':
    # Use threaded=True for better handling of concurrent requests
    app.run(debug=True, host='0.0.0.0', port=5000)
