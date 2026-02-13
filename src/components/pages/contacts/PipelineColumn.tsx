
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Contact } from '@/lib/services/types';
import { PipelineCard } from './PipelineCard';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PipelineColumnProps {
    id: string;
    title: string;
    color: string; // Tailwind class string for border/bg accent
    contacts: Contact[];
    onCardClick?: (contact: Contact) => void;
}

export function PipelineColumn({ id, title, color, contacts, onCardClick }: PipelineColumnProps) {
    // We use useDroppable to make the whole column a valid drop target
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: {
            type: 'Column',
            status: id
        }
    });

    const totalValue = contacts.reduce((sum, c) => sum + (c.deal_value || 0), 0);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <div className={`flex flex-col h-full min-w-[280px] max-w-[280px] rounded-lg border transition-colors ${isOver ? 'bg-slate-100 border-primary/50' : 'bg-gray-50/50 border-gray-200'}`}>
            {/* Header */}
            <div className={`p-3 border-b border-gray-200 rounded-t-lg ${color}`}>
                <div className="flex justify-between items-center mb-1">
                    <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{title}</h3>
                    <Badge variant="secondary" className="bg-white/80 text-gray-700 shadow-sm">{contacts.length}</Badge>
                </div>
                <div className="text-xs text-gray-500 font-medium">
                    {totalValue > 0 ? formatCurrency(totalValue) : '-'}
                </div>
            </div>

            {/* Droppable Area */}
            <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                    <div ref={setNodeRef} className="p-2 flex flex-col gap-2 min-h-[500px]">
                        <SortableContext
                            id={id}
                            items={contacts.map(c => c.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {contacts.map((contact) => (
                                <PipelineCard
                                    key={contact.id}
                                    contact={contact}
                                    onClick={onCardClick}
                                />
                            ))}
                        </SortableContext>
                    </div>
                </ScrollArea>
            </div>
        </div>
    );
}
