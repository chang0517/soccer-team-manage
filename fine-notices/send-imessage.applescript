on run {phoneNumber, messageText}
	tell application "Messages"
		set targetService to missing value
		try
			set targetService to 1st service whose service type = iMessage
		end try
		if targetService is missing value then
			set targetService to 1st service whose service type = SMS
		end if
		set targetBuddy to buddy phoneNumber of targetService
		send messageText to targetBuddy
	end tell
end run
