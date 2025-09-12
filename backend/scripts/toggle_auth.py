#!/usr/bin/env python3
"""
Script to enable authentication in production
This updates the trade routes to require user authentication
"""

import os
import re

def enable_authentication():
    """Enable authentication in the trades routes"""
    
    trades_file = os.path.join(os.path.dirname(__file__), "..", "app", "api", "routes", "trades.py")
    
    if not os.path.exists(trades_file):
        print(f"Error: {trades_file} not found")
        return False
    
    # Read the current file
    with open(trades_file, 'r') as f:
        content = f.read()
    
    # Replace commented auth lines with active ones
    replacements = [
        # Uncomment current_user parameter
        (r'    # current_user: User = Depends\(get_current_user\)', 
         '    current_user: User = Depends(get_current_user)'),
        
        # Replace mock user ID with current user ID
        (r'    # For development, use a mock user ID\n    mock_user_id = 1',
         '    user_id = current_user.id'),
        
        (r'user_id=mock_user_id',
         'user_id=user_id'),
        
        # Enable authorization checks
        (r'    # Skip authorization check for development\n    # if trade\.user_id != current_user\.id:\n    #     raise HTTPException\(status_code=403, detail="Not authorized to update this trade"\)',
         '    if trade.user_id != current_user.id:\n        raise HTTPException(status_code=403, detail="Not authorized to update this trade")'),
        
        (r'    # Skip authorization check for development\n    # if trade\.user_id != current_user\.id:\n    #     raise HTTPException\(status_code=403, detail="Not authorized to delete this trade"\)',
         '    if trade.user_id != current_user.id:\n        raise HTTPException(status_code=403, detail="Not authorized to delete this trade")'),
    ]
    
    modified_content = content
    changes_made = 0
    
    for pattern, replacement in replacements:
        if re.search(pattern, modified_content):
            modified_content = re.sub(pattern, replacement, modified_content)
            changes_made += 1
            print(f"✓ Applied authentication change {changes_made}")
    
    # Write the updated file
    if changes_made > 0:
        with open(trades_file, 'w') as f:
            f.write(modified_content)
        print(f"\n✓ Successfully enabled authentication in trades.py")
        print(f"  Made {changes_made} changes")
        return True
    else:
        print("No changes needed - authentication may already be enabled")
        return False

def disable_authentication():
    """Disable authentication for development (reverse of enable)"""
    
    trades_file = os.path.join(os.path.dirname(__file__), "..", "app", "api", "routes", "trades.py")
    
    if not os.path.exists(trades_file):
        print(f"Error: {trades_file} not found")
        return False
    
    # Read the current file
    with open(trades_file, 'r') as f:
        content = f.read()
    
    # Comment out auth lines
    replacements = [
        # Comment current_user parameter
        (r'    current_user: User = Depends\(get_current_user\)', 
         '    # current_user: User = Depends(get_current_user)'),
        
        # Replace user ID with mock
        (r'    user_id = current_user\.id',
         '    # For development, use a mock user ID\n    mock_user_id = 1'),
        
        (r'user_id=user_id',
         'user_id=mock_user_id'),
    ]
    
    modified_content = content
    changes_made = 0
    
    for pattern, replacement in replacements:
        if re.search(pattern, modified_content):
            modified_content = re.sub(pattern, replacement, modified_content)
            changes_made += 1
            print(f"✓ Disabled authentication change {changes_made}")
    
    # Write the updated file
    if changes_made > 0:
        with open(trades_file, 'w') as f:
            f.write(modified_content)
        print(f"\n✓ Successfully disabled authentication in trades.py")
        return True
    else:
        print("No changes needed")
        return False

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "disable":
        print("Disabling authentication for development...")
        disable_authentication()
    else:
        print("Enabling authentication for production...")
        enable_authentication()
        print("\nNOTE: Make sure to:")
        print("1. Create demo users: python scripts/create_demo_users.py")
        print("2. Test login functionality")
        print("3. Update frontend environment variables")
