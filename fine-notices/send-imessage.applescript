-- 아이폰·갤럭시 등 기종에 상관없이 문자로 확실히 전달되도록 SMS 서비스로
-- 직접 보낸다. (iMessage 서비스를 우선 시도하면 상대가 iMessage 사용자가
-- 아닐 때 조용히 전송 실패하고 SMS로 자동 대체되지 않는 문제가 있었음.)
on run {phoneNumber, messageText}
	tell application "Messages"
		set targetService to 1st service whose service type = SMS
		set targetBuddy to buddy phoneNumber of targetService
		send messageText to targetBuddy
	end tell
end run
