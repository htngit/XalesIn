import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronFirstIcon,
    ChevronLastIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface ContactsPaginationProps {
    totalItems: number
    itemsPerPage: number
    currentPage: number
    onPageChange: (page: number) => void
    onItemsPerPageChange: (itemsPerPage: number) => void
    className?: string
}

export function ContactsPagination({
    totalItems,
    itemsPerPage,
    currentPage,
    onPageChange,
    onItemsPerPageChange,
    className,
}: ContactsPaginationProps) {
    const totalPages = Math.ceil(totalItems / itemsPerPage)

    const handlePrevious = () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1)
        }
    }

    const handleNext = () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1)
        }
    }

    const handleFirst = () => {
        if (currentPage > 1) {
            onPageChange(1)
        }
    }

    const handleLast = () => {
        if (currentPage < totalPages) {
            onPageChange(totalPages)
        }
    }

    const handlePageSizeChange = (value: string) => {
        onItemsPerPageChange(Number(value))
    }

    return (
        <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-4", className)}>
            {/* Page Size Selector - Left side */}
            <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                    View:
                </span>
                <Select
                    value={itemsPerPage.toString()}
                    onValueChange={handlePageSizeChange}
                >
                    <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Select page size" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="150">150</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} contacts
                </span>
            </div>

            {/* Pagination Controls - Right side */}
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFirst}
                    disabled={currentPage === 1}
                    className="gap-1"
                >
                    <ChevronFirstIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">First</span>
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevious}
                    disabled={currentPage === 1}
                    className="gap-1"
                >
                    <ChevronLeftIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                </Button>

                <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                </span>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNext}
                    disabled={currentPage === totalPages}
                    className="gap-1"
                >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRightIcon className="h-4 w-4" />
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLast}
                    disabled={currentPage === totalPages}
                    className="gap-1"
                >
                    <span className="hidden sm:inline">Last</span>
                    <ChevronLastIcon className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}