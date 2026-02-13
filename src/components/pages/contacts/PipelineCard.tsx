
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Contact } from '@/lib/services/types';
import { Badge } from '@/components/ui/badge';
import { Calendar, Building2, User } from 'lucide-react';
// import { useIntl } from 'react-intl';
import { formatDistanceToNow } from 'date-fns';

interface PipelineCardProps {
    contact: Contact;
    onClick?: (contact: Contact) => void;
}

export function PipelineCard({ contact, onClick }: PipelineCardProps) {
    // const intl = useIntl();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: contact.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
        if (score >= 50) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (score >= 30) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        return 'bg-gray-100 text-gray-800 border-gray-200';
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onClick?.(contact)}
            className="bg-white p-3 rounded-md border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing mb-2 group"
        >
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-sm text-gray-900 line-clamp-1 group-hover:text-primary transition-colors">
                    {contact.name}
                </h4>
                {(contact.lead_score || 0) > 0 && (
                    <Badge className={`text-[10px] px-1 py-0 h-5 ${getScoreColor(contact.lead_score || 0)}`} variant="outline">
                        {contact.lead_score || 0}
                    </Badge>
                )}
            </div>

            <div className="space-y-1.5">
                {contact.company && (
                    <div className="flex items-center text-xs text-gray-500">
                        <Building2 className="h-3 w-3 mr-1.5 flex-shrink-0" />
                        <span className="truncate">{contact.company}</span>
                    </div>
                )}

                {/* Fallback if no company but job title exists */}
                {!contact.company && contact.job_title && (
                    <div className="flex items-center text-xs text-gray-500">
                        <User className="h-3 w-3 mr-1.5 flex-shrink-0" />
                        <span className="truncate">{contact.job_title}</span>
                    </div>
                )}

                {(contact.deal_value || 0) > 0 && (
                    <div className="text-sm font-medium text-gray-700">
                        {formatCurrency(contact.deal_value || 0)}
                    </div>
                )}

                {contact.next_follow_up && (
                    <div className="flex items-center text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit">
                        <Calendar className="h-3 w-3 mr-1.5" />
                        <span>
                            {formatDistanceToNow(new Date(contact.next_follow_up), { addSuffix: true })}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
