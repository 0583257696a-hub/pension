/**
 * VideoProvider: how a video for a lesson or a question gets produced.
 *
 * Today only the manual NotebookLM workflow exists, because no official API
 * creates or downloads Video Overviews. The interface lets an automatic
 * provider be added later without changing Video Studio.
 */
export interface VideoJobRequest {
  packageId: string;
  title: string;
  notebookUrl: string | null;
}

export type VideoJobState =
  | { state: "manual"; steps: string[] }
  | { state: "queued" | "running"; jobId: string }
  | { state: "done"; jobId: string; downloadUrl: string }
  | { state: "failed"; jobId: string; error: string };

export interface VideoProvider {
  readonly name: string;
  readonly automatic: boolean;
  request(job: VideoJobRequest): Promise<VideoJobState>;
  status(jobId: string): Promise<VideoJobState>;
}

export class ManualNotebookLmVideoProvider implements VideoProvider {
  readonly name = "notebooklm_manual";
  readonly automatic = false;

  async request(job: VideoJobRequest): Promise<VideoJobState> {
    return {
      state: "manual",
      steps: [
        job.notebookUrl ? `פתחו את המחברת: ${job.notebookUrl}` : "צרו מחברת חדשה ב-NotebookLM והעלו את מסמכי המקור מחבילת ההפקה.",
        "ודאו שכל המקורות סיימו להיטען.",
        "ב-Studio בחרו Video Overview, והדביקו את הנחיות ההתאמה מחבילת ההפקה.",
        "הורידו את הסרטון כקובץ MP4.",
        "שלבו את מקטע המחשבון שהופק אוטומטית, אם יש לשאלה פתרון במחשבון.",
        "העלו את הקובץ ב-Video Studio. המערכת תריץ בדיקות קובץ ותעביר אותו לאישור.",
      ],
    };
  }

  async status(): Promise<VideoJobState> {
    return { state: "manual", steps: [] };
  }
}

export function getVideoProvider(): VideoProvider {
  return new ManualNotebookLmVideoProvider();
}
