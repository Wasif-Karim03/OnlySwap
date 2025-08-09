# Debug Instructions for Image Upload Issues

## 🔍 **How to Check for Error Messages**

1. **Open Browser Developer Tools**:
   - Press `F12` or right-click and select "Inspect"
   - Go to the "Console" tab

2. **Try to Upload Images**:
   - Go to Create Listing page
   - Select multiple images
   - Try to submit the form
   - Check the console for error messages

3. **Look for These Error Types**:
   - Network errors (red text)
   - JavaScript errors (red text)
   - API response errors
   - File upload errors

## 🐛 **Common Issues & Solutions**

### Issue 1: "Failed to fetch" or Network Errors
- **Cause**: Server not running or CORS issues
- **Solution**: Make sure server is running on port 5001

### Issue 2: "No token provided" 
- **Cause**: User not logged in
- **Solution**: Sign in to your account first

### Issue 3: "File too large" or "Invalid file type"
- **Cause**: File validation failing
- **Solution**: Use images under 5MB, PNG/JPG/JPEG format

### Issue 4: Preview images not showing
- **Cause**: File preview URLs not created correctly
- **Solution**: Check if files are being processed correctly

## 📋 **Testing Steps**

1. **Test Server Connection**:
   ```bash
   curl http://localhost:5001/api/health
   ```

2. **Test Authentication**:
   - Make sure you're logged in
   - Check if token exists in localStorage

3. **Test File Upload**:
   - Try with different file types
   - Try with different file sizes
   - Check console for detailed logs

## 🚨 **If Still Having Issues**

1. **Check Server Logs**:
   - Look at the terminal where server is running
   - Look for error messages

2. **Check Browser Network Tab**:
   - Go to Network tab in DevTools
   - Try uploading images
   - Look for failed requests

3. **Report Specific Error Messages**:
   - Copy the exact error message from console
   - Include any network request details 