import { getMobileReachableBaseUrl } from "@/lib/server-url";

/**
 * Generiert die XML-Property-List für einen Apple iOS Kurzbefehl,
 * der Workouts der letzten 24 Stunden aus Apple Health abfragt und
 * automatisch per POST an das FitFamily Dashboard schickt.
 */
export function generateAppleShortcutXml(profileId: string, profileName: string, request?: Request): string {
  const baseUrl = getMobileReachableBaseUrl(request);
  const syncEndpoint = `${baseUrl.replace(/\/$/, "")}/api/sync/apple-health`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>WFWorkflowActions</key>
	<array>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.comment</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFCommentActionText</key>
				<string>FitFamily Apple Health Sync für ${profileName} (${profileId})&#10;Sendet Workouts an: ${syncEndpoint}</string>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.filter.health.quantity</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFContentItemFilter</key>
				<dict>
					<key>WFActionParameterFilterPrefix</key>
					<integer>1</integer>
					<key>WFContentPredicateTable</key>
					<dict>
						<key>entityType</key>
						<string>HKWorkoutTypeIdentifier</string>
					</dict>
				</dict>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.url</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFURLActionURL</key>
				<string>${syncEndpoint}</string>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.downloadurl</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFHTTPMethod</key>
				<string>POST</string>
				<key>WFHTTPHeaders</key>
				<dict>
					<key>Content-Type</key>
					<string>application/json</string>
				</dict>
				<key>WFHTTPBodyType</key>
				<string>JSON</string>
				<key>WFJSONValues</key>
				<dict>
					<key>profileId</key>
					<string>${profileId}</string>
					<key>title</key>
					<string>Apple Health Workout</string>
				</dict>
			</dict>
		</dict>
		<dict>
			<key>WFWorkflowActionIdentifier</key>
			<string>is.workflow.actions.notification</string>
			<key>WFWorkflowActionParameters</key>
			<dict>
				<key>WFNotificationActionTitle</key>
				<string>FitFamily Sync</string>
				<key>WFNotificationActionBody</key>
				<string>Training für ${profileName} erfolgreich an FitFamily übertragen!</string>
			</dict>
		</dict>
	</array>
	<key>WFWorkflowClientVersion</key>
	<string>2200</string>
	<key>WFWorkflowIcon</key>
	<dict>
		<key>WFWorkflowIconGlyphNumber</key>
		<integer>59546</integer>
		<key>WFWorkflowIconStartColor</key>
		<integer>4282601983</integer>
	</dict>
	<key>WFWorkflowInputContentItemClasses</key>
	<array/>
	<key>WFWorkflowMinimumClientVersion</key>
	<integer>900</integer>
	<key>WFWorkflowMinimumClientVersionString</key>
	<string>900</string>
	<key>WFWorkflowTypes</key>
	<array>
		<string>NCWidget</string>
		<string>Watch</string>
	</array>
</dict>
</plist>`;
}
