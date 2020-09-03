/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { callWithTelemetryAndErrorHandling, IActionContext } from 'vscode-azureextensionui';
import { ext } from '../../extensionVariables';
import { awareness } from './awareness';

// Currently-active surveys should be registered here
const currentSurveys = [awareness];

const surveyRespondedKeyPrefix = 'vscode-docker.surveys.response';
const surveyFlightPrefix = 'vscode-docker.surveys';
const lastToastedSessionKey = 'vscode-docker.surveys.lastSession';

export interface Survey {
    id: string;
    prompt: string;
    buttons: Map<string, string | undefined>;
    activationDelayMs: number;
    isEligible(): Promise<boolean>;
}

export class SurveyManager {
    public activate(): void {
        if (!ext.telemetryOptIn || ext.runningTests) {
            return;
        }

        for (const survey of currentSurveys) {
            const timer = setTimeout(
                async () => {
                    clearTimeout(timer);
                    await this.executeSurvey(survey);
                },
                survey.activationDelayMs
            );
        }
    }

    private async executeSurvey(survey: Survey): Promise<void> {
        try {
            const shouldShowPrompt: boolean = await callWithTelemetryAndErrorHandling('surveyCheck', async (context: IActionContext) => {
                context.telemetry.properties.surveyId = survey.id;
                context.telemetry.properties.isActivationEvent = 'true';

                const alreadyToasted = ext.context.globalState.get<string>(lastToastedSessionKey) === vscode.env.sessionId;
                const responded = ext.context.globalState.get<boolean>(`${surveyRespondedKeyPrefix}.${survey.id}`, false);
                const eligible = await survey.isEligible();
                const flighted = await ext.experimentationService.isFlightEnabled(`${surveyFlightPrefix}.${survey.id}`);

                context.telemetry.properties.surveyAlreadyToasted = alreadyToasted.toString();
                context.telemetry.properties.surveyResponded = responded.toString();
                context.telemetry.properties.surveyEligible = eligible.toString();
                context.telemetry.properties.surveyFlighted = flighted.toString();

                return !alreadyToasted && !responded && eligible && flighted;
            });

            if (shouldShowPrompt) {
                await callWithTelemetryAndErrorHandling('surveyResponse', async (context: IActionContext) => {
                    context.telemetry.properties.surveyId = survey.id;
                    context.telemetry.properties.isActivationEvent = 'true';

                    const response = await this.surveyPrompt(survey);
                    context.telemetry.properties.surveyResponse = response ? 'true' : 'false';
                    context.telemetry.properties.surveyChoice = response;

                    if (response) {
                        await this.surveyOpen(response);
                    }
                });
            }
        } catch { } // Best effort
    }

    private async surveyOpen(url: string): Promise<void> {
        await vscode.env.openExternal(vscode.Uri.parse(`${url}?o=${encodeURIComponent(process.platform)}&m=${encodeURIComponent(vscode.env.machineId)}`));
    }

    private async surveyPrompt(survey: Survey): Promise<string | undefined> {
        await ext.context.globalState.update(`${surveyRespondedKeyPrefix}.${survey.id}`, true);
        await ext.context.globalState.update(lastToastedSessionKey, vscode.env.sessionId);

        const buttons = Array.from(survey.buttons.keys());

        const result = await vscode.window.showInformationMessage(survey.prompt, ...buttons);

        if (result === undefined) {
            return undefined;
        }

        return survey.buttons.get(result);
    }
}
