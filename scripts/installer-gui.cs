using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public class VencordInstaller : Form
{
    private Button actionBtn;
    private ProgressBar progressBar;
    private TextBox logBox;
    private Label statusLabel;
    private BackgroundWorker worker;
    private bool installed;

    public VencordInstaller()
    {
        Text = "Vencord Installer";
        ClientSize = new Size(500, 400);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(49, 51, 56);

        Label title = new Label();
        title.Text = "Vencord Installer";
        title.Font = new Font("Segoe UI", 18F, FontStyle.Bold);
        title.ForeColor = Color.White;
        title.AutoSize = true;
        title.Location = new Point(20, 12);
        Controls.Add(title);

        Label sub = new Label();
        sub.Text = "with External Plugins support";
        sub.Font = new Font("Segoe UI", 9F);
        sub.ForeColor = Color.FromArgb(148, 155, 164);
        sub.AutoSize = true;
        sub.Location = new Point(22, 48);
        Controls.Add(sub);

        actionBtn = new Button();
        actionBtn.Text = "Install";
        actionBtn.Size = new Size(460, 44);
        actionBtn.Location = new Point(20, 78);
        actionBtn.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
        actionBtn.BackColor = Color.FromArgb(88, 101, 242);
        actionBtn.FlatStyle = FlatStyle.Flat;
        actionBtn.ForeColor = Color.White;
        actionBtn.Cursor = Cursors.Hand;
        actionBtn.FlatAppearance.BorderSize = 0;
        actionBtn.Click += OnActionClick;
        Controls.Add(actionBtn);

        progressBar = new ProgressBar();
        progressBar.Size = new Size(460, 4);
        progressBar.Location = new Point(20, 130);
        progressBar.Style = ProgressBarStyle.Continuous;
        progressBar.Visible = false;
        Controls.Add(progressBar);

        statusLabel = new Label();
        statusLabel.Text = "Click Install to begin";
        statusLabel.Font = new Font("Segoe UI", 9F);
        statusLabel.ForeColor = Color.FromArgb(148, 155, 164);
        statusLabel.Size = new Size(460, 18);
        statusLabel.Location = new Point(20, 140);
        Controls.Add(statusLabel);

        logBox = new TextBox();
        logBox.Multiline = true;
        logBox.ReadOnly = true;
        logBox.ScrollBars = ScrollBars.Vertical;
        logBox.Size = new Size(460, 220);
        logBox.Location = new Point(20, 164);
        logBox.BackColor = Color.FromArgb(30, 31, 34);
        logBox.ForeColor = Color.FromArgb(219, 222, 225);
        logBox.Font = new Font("Consolas", 9F);
        logBox.BorderStyle = BorderStyle.FixedSingle;
        Controls.Add(logBox);

        worker = new BackgroundWorker();
        worker.WorkerReportsProgress = true;
        worker.DoWork += DoInstall;
        worker.ProgressChanged += OnProgress;
        worker.RunWorkerCompleted += OnComplete;
    }

    private void OnActionClick(object sender, EventArgs e)
    {
        if (installed) { Close(); return; }

        Process[] procs = Process.GetProcessesByName("Discord");
        if (procs.Length > 0)
        {
            DialogResult r = MessageBox.Show(
                "Discord is running.\nClose it to continue installation?",
                "Vencord Installer",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Warning);

            if (r == DialogResult.Cancel) return;
            if (r == DialogResult.Yes)
            {
                foreach (Process p in procs)
                    try { p.Kill(); } catch { }
                Thread.Sleep(2000);
            }
        }

        actionBtn.Enabled = false;
        actionBtn.Text = "Installing...";
        actionBtn.BackColor = Color.FromArgb(78, 91, 222);
        progressBar.Value = 0;
        progressBar.Visible = true;
        logBox.Clear();
        statusLabel.ForeColor = Color.FromArgb(148, 155, 164);
        worker.RunWorkerAsync();
    }

    private void DoInstall(object sender, DoWorkEventArgs e)
    {
        BackgroundWorker w = (BackgroundWorker)sender;
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        string distSrc = Path.Combine(exeDir, "dist");

        // ── Validate ────────────────────────────────────────────────────
        w.ReportProgress(5, "Checking files...");
        if (!Directory.Exists(distSrc))
        {
            e.Result = "ERR:'dist' folder not found next to the installer.";
            return;
        }
        string[] req = new string[] { "patcher.js", "preload.js", "renderer.js", "renderer.css" };
        foreach (string f in req)
        {
            if (!File.Exists(Path.Combine(distSrc, f)))
            {
                e.Result = "ERR:Missing file: dist/" + f;
                return;
            }
        }
        w.ReportProgress(10, "All required files present.");

        // ── Copy dist files ─────────────────────────────────────────────
        w.ReportProgress(15, "Copying Vencord files...");
        string appdata = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string vencordDir = Path.Combine(appdata, "Vencord");
        string distDest = Path.Combine(vencordDir, "dist");
        try
        {
            Directory.CreateDirectory(distDest);
            string[] files = Directory.GetFiles(distSrc);
            for (int i = 0; i < files.Length; i++)
            {
                string name = Path.GetFileName(files[i]);
                File.Copy(files[i], Path.Combine(distDest, name), true);
                int pct = 15 + (35 * (i + 1) / files.Length);
                w.ReportProgress(pct, "  " + name);
            }
        }
        catch (Exception ex)
        {
            e.Result = "ERR:Copy failed: " + ex.Message;
            return;
        }
        w.ReportProgress(50, "Installed to " + distDest);

        // ── Plugins directory ───────────────────────────────────────────
        string pluginsDir = Path.Combine(vencordDir, "plugins");
        if (!Directory.Exists(pluginsDir))
        {
            Directory.CreateDirectory(pluginsDir);
            w.ReportProgress(52, "Created plugins folder.");
        }

        // ── Find Discord ────────────────────────────────────────────────
        w.ReportProgress(55, "Looking for Discord...");
        string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string discordBase = Path.Combine(localApp, "Discord");
        if (!Directory.Exists(discordBase))
        {
            e.Result = "ERR:Discord not found. Is it installed?";
            return;
        }
        string[] appDirs = Directory.GetDirectories(discordBase, "app-*");
        Array.Sort(appDirs);
        Array.Reverse(appDirs);
        if (appDirs.Length == 0)
        {
            e.Result = "ERR:No Discord versions found.";
            return;
        }
        foreach (string d in appDirs)
            w.ReportProgress(60, "  " + Path.GetFileName(d));

        // ── Patch Discord ───────────────────────────────────────────────
        w.ReportProgress(65, "Patching Discord...");
        string patcherJs = Path.Combine(distDest, "patcher.js").Replace("\\", "\\\\");
        int ok = 0;
        foreach (string appDir in appDirs)
        {
            string res = Path.Combine(appDir, "resources");
            if (!Directory.Exists(res)) continue;

            string asar = Path.Combine(res, "app.asar");
            string bak = Path.Combine(res, "_app.asar");
            try
            {
                if (!File.Exists(bak) && File.Exists(asar))
                    if (new FileInfo(asar).Length > 1024)
                        File.Move(asar, bak);

                WriteAsar(asar, patcherJs);
                ok++;
                w.ReportProgress(85, "  Patched " + Path.GetFileName(appDir));
            }
            catch (Exception ex)
            {
                w.ReportProgress(85, "  WARN: " + Path.GetFileName(appDir) + " - " + ex.Message);
            }
        }

        if (ok == 0)
        {
            e.Result = "ERR:Could not patch any Discord version.";
            return;
        }

        w.ReportProgress(100, "");
        e.Result = "OK:" + pluginsDir;
    }

    private void OnProgress(object sender, ProgressChangedEventArgs e)
    {
        progressBar.Value = e.ProgressPercentage;
        string msg = e.UserState as string;
        if (!string.IsNullOrEmpty(msg))
        {
            statusLabel.Text = msg;
            logBox.AppendText(msg + Environment.NewLine);
        }
    }

    private void OnComplete(object sender, RunWorkerCompletedEventArgs e)
    {
        if (e.Error != null) { Fail(e.Error.Message); return; }

        string r = e.Result as string;
        if (r == null) { Fail("Unknown error."); return; }
        if (r.StartsWith("ERR:")) { Fail(r.Substring(4)); return; }

        string plugDir = r.StartsWith("OK:") ? r.Substring(3) : "";
        progressBar.Value = 100;
        statusLabel.Text = "Installation complete! Restart Discord.";
        statusLabel.ForeColor = Color.FromArgb(87, 242, 135);

        logBox.AppendText(Environment.NewLine);
        logBox.AppendText("Installation complete!" + Environment.NewLine);
        logBox.AppendText("Restart Discord to apply." + Environment.NewLine);
        if (plugDir.Length > 0)
        {
            logBox.AppendText(Environment.NewLine + "External plugins folder:" + Environment.NewLine);
            logBox.AppendText(plugDir + Environment.NewLine);
        }

        installed = true;
        actionBtn.Text = "Close";
        actionBtn.BackColor = Color.FromArgb(87, 242, 135);
        actionBtn.ForeColor = Color.FromArgb(30, 31, 34);
        actionBtn.Enabled = true;
    }

    private void Fail(string msg)
    {
        statusLabel.Text = msg;
        statusLabel.ForeColor = Color.FromArgb(237, 66, 69);
        logBox.AppendText(Environment.NewLine + "ERROR: " + msg + Environment.NewLine);
        actionBtn.Text = "Retry";
        actionBtn.BackColor = Color.FromArgb(88, 101, 242);
        actionBtn.Enabled = true;
    }

    // Writes a minimal ASAR archive that require()s the patcher
    static void WriteAsar(string path, string patcherPath)
    {
        string idx = "require(\"" + patcherPath + "\")";
        string pkg = "{\"name\":\"discord\",\"main\":\"index.js\"}";

        byte[] ib = Encoding.UTF8.GetBytes(idx);
        byte[] pb = Encoding.UTF8.GetBytes(pkg);

        string hdr = string.Format(
            "{{\"files\":{{\"index.js\":{{\"size\":{0},\"offset\":\"0\"}}," +
            "\"package.json\":{{\"size\":{1},\"offset\":\"{2}\"}}}}}}",
            ib.Length, pb.Length, ib.Length);

        byte[] hb = Encoding.UTF8.GetBytes(hdr);
        int hLen = hb.Length;
        int aligned = (hLen + 3) & ~3;
        int pad = aligned - hLen;

        using (FileStream fs = new FileStream(path, FileMode.Create, FileAccess.Write))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            bw.Write((uint)4);
            bw.Write((uint)(aligned + 8));
            bw.Write((uint)(aligned + 4));
            bw.Write((uint)hLen);
            bw.Write(hb);
            if (pad > 0) bw.Write(new byte[pad]);
            bw.Write(ib);
            bw.Write(pb);
        }
    }

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new VencordInstaller());
    }
}
