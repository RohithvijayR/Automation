#!/usr/bin/env python3
"""
Sri Sai Ram Engineering College - Attendance Automation Bot
Error-free production version
"""

import requests
import time
import re
import json
from datetime import datetime


class AttendanceBot:
    def __init__(self, venue="IW4106"):
        self.venue = venue
        self.base_url = "https://script.google.com/macros/s/AKfycbxfbntqlqj0itRc9oIcEuxR3vqjhNoZyTWF35toBfKlTwQGXV3QkTKdtrfKWcKKP2j2/exec"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        })
    
    def get_fresh_token(self):
        """Fetch current token from display page"""
        display_url = f"{self.base_url}?display=1&v={self.venue}"
        try:
            response = self.session.get(display_url, timeout=10)
            
            token_match = re.search(r'Current Token\s*:\s*([A-Z0-9]+)', response.text)
            if token_match:
                return token_match.group(1)
            
            qr_match = re.search(r't=([A-Z0-9]+)', response.text)
            if qr_match:
                return qr_match.group(1)
            
            return None
        except Exception:
            return None
    
    def mark_attendance(self, student_id, token):
        """Mark attendance using GET request"""
        url = f"{self.base_url}?v={self.venue}&t={token}&studentId={student_id}"
        
        try:
            response = self.session.get(url, timeout=15, allow_redirects=True)
            text_lower = response.text.lower()
            
            already_patterns = [
                "already marked", "already submitted", "you have already",
                "attendance already", "previously marked", "duplicate entry",
                "already recorded", "exists"
            ]
            if any(p in text_lower for p in already_patterns):
                return {"status": "ALREADY_MARKED", "code": response.status_code}
            
            success_patterns = [
                "success", "thank you", "marked successfully",
                "attendance recorded", "confirmed", "completed",
                "submitted", "received", "done"
            ]
            if any(p in text_lower for p in success_patterns):
                return {"status": "SUCCESS", "code": response.status_code}
            
            if "studentid" in text_lower and "<input" in response.text:
                return {"status": "FAILED", "code": response.status_code}
            
            return {"status": "UNKNOWN", "code": response.status_code}
            
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}
    
    def process_student(self, student_id, max_retries=3):
        """Process one student with retry logic"""
        for attempt in range(max_retries):
            token = self.get_fresh_token()
            if not token:
                time.sleep(1)
                continue
            
            result = self.mark_attendance(student_id, token)
            
            if result["status"] == "SUCCESS":
                return result
            elif result["status"] == "ALREADY_MARKED":
                return result
            elif result["status"] == "FAILED" and attempt < max_retries - 1:
                time.sleep(2)
                continue
            else:
                return result
        
        return {"status": "FAILED", "error": "Max retries exceeded"}
    
    def process_batch(self, student_ids):
        """Process multiple students"""
        print(f"\n{'='*60}")
        print(f"Batch Attendance - {len(student_ids)} Students")
        print(f"Venue: {self.venue}")
        print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")
        
        results = []
        
        for i, student_id in enumerate(student_ids, 1):
            print(f"[{i:2d}/{len(student_ids)}] {student_id}: ", end="", flush=True)
            
            result = self.process_student(student_id)
            status = result["status"]
            
            if status == "SUCCESS":
                print("MARKED")
                results.append({"id": student_id, "status": "MARKED"})
            elif status == "ALREADY_MARKED":
                print("ALREADY MARKED")
                results.append({"id": student_id, "status": "ALREADY_MARKED"})
            else:
                print(f"FAILED - {status}")
                results.append({"id": student_id, "status": "FAILED"})
            
            if i < len(student_ids):
                time.sleep(1.5)
        
        marked = sum(1 for r in results if r["status"] == "MARKED")
        already = sum(1 for r in results if r["status"] == "ALREADY_MARKED")
        failed = sum(1 for r in results if r["status"] == "FAILED")
        
        print(f"\n{'='*60}")
        print(f"SUMMARY")
        print(f"   Marked:        {marked}")
        print(f"   Already Done:  {already}")
        print(f"   Failed:        {failed}")
        print(f"{'='*60}\n")
        
        return results


if __name__ == "__main__":
    STUDENT_IDS = [
        "SIT23SC001",
        "SIT23SC002", 
        "SIT23SC003",
        "SIT23SC004",
        "SIT23SC005",
        "SIT23SC006",
        "SIT23SC007",
        "SIT23SC008",
        "SIT23SC009",
        "SIT23SC010",
        "SIT23SC011",
        "SIT23SC012",
        "SIT23SC013",
        "SIT23SC014",
        "SIT23SC015",
        "SIT23SC016",
        "SIT23SC017",
        "SIT23SC018",
        "SIT23SC019",
        "SIT23SC020",
        "SIT23SC021",
        "SIT23SC022",
        "SIT23SC023",
        "SIT23SC024",
        "SIT23SC025",
        "SIT23SC026",
        "SIT23SC027",
        "SIT23SC028",
        "SIT23SC029",
        "SIT23SC030",
    ]
    
    VENUE = "IW4106"
    
    bot = AttendanceBot(venue=VENUE)
    results = bot.process_batch(STUDENT_IDS)
    
    with open(f"attendance_results_{datetime.now().strftime('%H%M%S')}.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "venue": VENUE,
            "results": results
        }, f, indent=2)