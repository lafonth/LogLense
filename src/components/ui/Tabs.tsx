interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div role="tablist" className="border-border flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`focus-visible:outline-brass-bright shrink-0 cursor-pointer border-b-2 px-4 py-2.5 font-sans text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${
              selected ? 'border-brass text-text' : 'text-muted hover:text-text border-transparent'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
