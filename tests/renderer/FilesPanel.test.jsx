import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FilesPanel } from '../../src/renderer.jsx';

const makeEntry = (name, isDirectory = false) => ({
  name,
  isDirectory,
  size: isDirectory ? 0 : 1024,
  mtime: Date.now(),
});

const fakeReaddirResult = (entries, dir = '/home/user') => ({
  success: true,
  entries,
  dirPath: dir,
  parentDir: '/home',
});

describe('FilesPanel', () => {
  beforeEach(() => {
    window.electronAPI.fsGetHome.mockResolvedValue('/home/user');
    window.electronAPI.fsReaddir.mockResolvedValue(
      fakeReaddirResult([
        makeEntry('docs', true),
        makeEntry('notes.cnb', false),
        makeEntry('readme.txt', false),
      ])
    );
  });

  it('renders breadcrumb segments from currentDir', async () => {
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={vi.fn()}
      onOpenNotebook={vi.fn()}
      notebookDir={null}
    />);
    await waitFor(() => {
      expect(document.querySelector('.files-breadcrumb')).not.toBeNull();
    });
    // Breadcrumb should contain "user" segment
    expect(screen.getByText('user')).toBeInTheDocument();
  });

  it('double-clicking a folder entry calls fsReaddir with new path', async () => {
    const onNavigate = vi.fn();
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={onNavigate}
      onOpenNotebook={vi.fn()}
      notebookDir={null}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    fireEvent.dblClick(screen.getByText('docs').closest('.files-entry'));
    await waitFor(() => {
      expect(window.electronAPI.fsReaddir).toHaveBeenCalledWith('/home/user/docs');
    });
  });

  it('double-clicking a .cnb file fires onOpenNotebook', async () => {
    const onOpenNotebook = vi.fn();
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={vi.fn()}
      onOpenNotebook={onOpenNotebook}
      notebookDir={null}
    />);
    await waitFor(() => expect(screen.getByText('notes.cnb')).toBeInTheDocument());
    fireEvent.dblClick(screen.getByText('notes.cnb').closest('.files-entry'));
    expect(onOpenNotebook).toHaveBeenCalledWith('/home/user/notes.cnb');
  });

  it('renders target button when notebookDir is set', async () => {
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={vi.fn()}
      onOpenNotebook={vi.fn()}
      notebookDir="/home/user/projects"
    />);
    await waitFor(() => {
      // The target/navigate-to-notebook-dir button is present
      const btns = document.querySelectorAll('.files-up-btn');
      expect(btns.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('delete button fires fsDelete and refreshes', async () => {
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={vi.fn()}
      onOpenNotebook={vi.fn()}
      notebookDir={null}
    />);
    await waitFor(() => expect(screen.getByText('readme.txt')).toBeInTheDocument());
    const deleteBtn = screen.getAllByTitle('Move to Trash')[0];
    fireEvent.click(deleteBtn);
    expect(window.electronAPI.fsDelete).toHaveBeenCalled();
  });

  it('new folder button shows create input', async () => {
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={vi.fn()}
      onOpenNotebook={vi.fn()}
      notebookDir={null}
    />);
    await waitFor(() => expect(screen.getByTitle('New folder')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('New folder'));
    expect(document.querySelector('.files-rename-input')).not.toBeNull();
  });

  it('breadcrumb segment click navigates to ancestor path', async () => {
    const onNavigate = vi.fn();
    render(<FilesPanel
      currentDir="/home/user"
      onNavigate={onNavigate}
      onOpenNotebook={vi.fn()}
      notebookDir={null}
    />);
    await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument());
    fireEvent.click(screen.getByText('home'));
    await waitFor(() => {
      expect(window.electronAPI.fsReaddir).toHaveBeenCalledWith('/home');
    });
  });
});

describe('FilesPanel — favorite folders', () => {
  beforeEach(() => {
    window.electronAPI.fsGetHome.mockResolvedValue('/home/user');
    window.electronAPI.fsReaddir.mockResolvedValue(
      fakeReaddirResult([
        makeEntry('docs', true),
        makeEntry('readme.txt', false),
      ])
    );
  });

  const baseProps = () => ({
    currentDir: '/home/user',
    onNavigate: vi.fn(),
    onOpenNotebook: vi.fn(),
    notebookDir: null,
  });

  it('does not render favorites section when favoriteFolders is empty', async () => {
    render(<FilesPanel {...baseProps()} favoriteFolders={[]} onToggleFavorite={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    expect(document.querySelector('.files-favorites')).toBeNull();
  });

  it('renders favorites section with folder names when favoriteFolders has entries', async () => {
    render(<FilesPanel
      {...baseProps()}
      favoriteFolders={['/home/user/projects', '/home/user/work']}
      onToggleFavorite={vi.fn()}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    expect(document.querySelector('.files-favorites')).not.toBeNull();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('projects')).toBeInTheDocument();
    expect(screen.getByText('work')).toBeInTheDocument();
  });

  it('star button shows active class when current directory is a favorite', async () => {
    render(<FilesPanel
      {...baseProps()}
      favoriteFolders={['/home/user']}
      onToggleFavorite={vi.fn()}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    const starBtn = document.querySelector('.files-fav-btn');
    expect(starBtn).not.toBeNull();
    expect(starBtn.classList.contains('active')).toBe(true);
  });

  it('star button does not have active class when current directory is not a favorite', async () => {
    render(<FilesPanel
      {...baseProps()}
      favoriteFolders={['/somewhere/else']}
      onToggleFavorite={vi.fn()}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    const starBtn = document.querySelector('.files-fav-btn');
    expect(starBtn).not.toBeNull();
    expect(starBtn.classList.contains('active')).toBe(false);
  });

  it('clicking star button calls onToggleFavorite with currentDir', async () => {
    const onToggleFavorite = vi.fn();
    render(<FilesPanel
      {...baseProps()}
      favoriteFolders={[]}
      onToggleFavorite={onToggleFavorite}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    const starBtn = document.querySelector('.files-fav-btn');
    fireEvent.click(starBtn);
    expect(onToggleFavorite).toHaveBeenCalledWith('/home/user');
  });

  it('clicking a favorite entry calls fsReaddir to navigate there', async () => {
    render(<FilesPanel
      {...baseProps()}
      favoriteFolders={['/home/user/projects']}
      onToggleFavorite={vi.fn()}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    // Clear the initial load calls
    window.electronAPI.fsReaddir.mockClear();
    window.electronAPI.fsReaddir.mockResolvedValue(
      fakeReaddirResult([], '/home/user/projects')
    );
    fireEvent.click(screen.getByText('projects'));
    await waitFor(() => {
      expect(window.electronAPI.fsReaddir).toHaveBeenCalledWith('/home/user/projects');
    });
  });

  it('collapsing favorites header hides the list, expanding shows it', async () => {
    render(<FilesPanel
      {...baseProps()}
      favoriteFolders={['/home/user/projects']}
      onToggleFavorite={vi.fn()}
    />);
    await waitFor(() => expect(screen.getByText('docs')).toBeInTheDocument());
    // Initially expanded — list visible
    expect(document.querySelector('.files-favorites-list')).not.toBeNull();
    expect(screen.getByText('projects')).toBeInTheDocument();

    // Collapse by clicking the header
    fireEvent.click(screen.getByText('Favorites'));
    expect(document.querySelector('.files-favorites-list')).toBeNull();

    // Expand again
    fireEvent.click(screen.getByText('Favorites'));
    expect(document.querySelector('.files-favorites-list')).not.toBeNull();
    expect(screen.getByText('projects')).toBeInTheDocument();
  });
});
